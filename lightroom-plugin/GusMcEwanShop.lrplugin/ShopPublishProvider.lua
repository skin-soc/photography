--[[
  Gus McEwan Shop — publish service provider.

  On Publish, Lightroom renders each photo as an 800px sRGB JPEG and this
  provider writes it to <shopDataDir>/previews/<id>.jpg (fast SSD), then rebuilds
  <shopDataDir>/catalog.json from every Shop published collection.

  Full-resolution download MASTERS are produced separately by the "Export
  masters" button (a Publish can't drive a second render): masters/<id>.jpg for
  every photo, plus masters/<id>.tif (16-bit) for RAW shots, written to the bulk
  fulfilment store. The LAN origin serves previews from previews/ and builds the
  paid downloads from masters/.

  Photo id = the original filename without extension. Category = the name of
  the published collection the photo lives in (use People / Places / Nature).
]]

local LrPathUtils = import 'LrPathUtils'
local LrFileUtils = import 'LrFileUtils'
local LrDialogs = import 'LrDialogs'
local LrView = import 'LrView'
local LrDate = import 'LrDate'
local LrApplication = import 'LrApplication'
local LrTasks = import 'LrTasks'
local LrExportSession = import 'LrExportSession'
local LrFunctionContext = import 'LrFunctionContext'
local LrProgressScope = import 'LrProgressScope'

-- Pure-Lua HMAC-SHA256 → the GMP reference the origin/Worker use.
local Sha256 = require 'Sha256'

--==================================================================--
-- Helpers
--==================================================================--

--- Minimal JSON encoder (compact). Handles strings, numbers, booleans,
--- nil, arrays (1..n integer keys) and objects.
local function jsonEncode(value)
  local t = type(value)
  if value == nil then
    return 'null'
  elseif t == 'boolean' then
    return tostring(value)
  elseif t == 'number' then
    -- avoid locale issues / trailing junk
    if value ~= value or value == math.huge or value == -math.huge then return '0' end
    return string.format('%.14g', value)
  elseif t == 'string' then
    local escaped = value:gsub('[%z\1-\31\\"]', function(c)
      local map = {
        ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b',
        ['\f'] = '\\f', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t',
      }
      return map[c] or string.format('\\u%04x', string.byte(c))
    end)
    return '"' .. escaped .. '"'
  elseif t == 'table' then
    local n = 0
    local isArray = true
    for k in pairs(value) do
      n = n + 1
      if type(k) ~= 'number' then isArray = false end
    end
    if isArray then
      local parts = {}
      for i = 1, #value do parts[i] = jsonEncode(value[i]) end
      return '[' .. table.concat(parts, ',') .. ']'
    end
    local parts = {}
    for k, v in pairs(value) do
      parts[#parts + 1] = jsonEncode(tostring(k)) .. ':' .. jsonEncode(v)
    end
    return '{' .. table.concat(parts, ',') .. '}'
  end
  return 'null'
end

--- URL/filename-safe slug. Non-ASCII-alphanumeric runs collapse to a hyphen.
local function slugify(s)
  if not s or s == '' then return nil end
  s = tostring(s):lower()
  s = s:gsub('[^%w]+', '-')
  s = s:gsub('^%-+', ''):gsub('%-+$', '')
  if s == '' then return nil end
  return s
end

--- Stable id from a filename: strip extension, keep only safe chars.
local function idFromFilename(filename)
  local base = LrPathUtils.removeExtension(filename or '')
  base = base:gsub('[^%w%-_]', '-')
  base = base:gsub('%-+', '-'):gsub('^%-+', ''):gsub('%-+$', '')
  return base
end

--- "City, Country" from whatever IPTC location fields are filled.
local function composeLocation(photo)
  local parts = {}
  for _, field in ipairs({ 'city', 'stateProvince', 'country' }) do
    local v = photo:getFormattedMetadata(field)
    if v and v ~= '' then parts[#parts + 1] = v end
  end
  if #parts == 0 then
    local loc = photo:getFormattedMetadata('location')
    if loc and loc ~= '' then return loc end
    return ''
  end
  return table.concat(parts, ', ')
end

--==================================================================--
-- Full-resolution master export (fulfilment source)
--==================================================================--

-- Masters are the FULFILMENT source the LAN origin reads (separate from the
-- 800px previews Publish writes to the SSD):
--   masters/<id>.jpg  — full-res EDITED JPEG, for every photo (JPEG tiers).
--   masters/<id>.tif  — full-res EDITED 16-bit TIFF, RAW shots only (TIFF tiers).
-- Both are produced by the "Export masters" button (Lightroom won't render an
-- export from inside a Publish, and can't mix formats in one pass).

--- The masters folder for a settings table: <mastersDir-or-shopData>/masters.
local function mastersDirFor(settings)
  local root = (settings.mastersDir and settings.mastersDir ~= '')
    and settings.mastersDir or settings.shopDataDir
  return LrPathUtils.child(root, 'masters')
end

--- Delete a master's files (both formats) by base name (the GMP reference).
local function deleteMasters(mastersDir, baseName)
  for _, ext in ipairs({ '.jpg', '.tif' }) do
    local p = LrPathUtils.child(mastersDir, baseName .. ext)
    if LrFileUtils.exists(p) then LrFileUtils.delete(p) end
  end
end

--- Export settings for a full-res master written into the masters folder.
--- isJpeg → max-quality sRGB JPEG; else 16-bit AdobeRGB TIFF.
local function masterExportSettings(isJpeg, destFolder)
  local s = {
    LR_export_destinationType = 'specificFolder',
    LR_export_destinationPathPrefix = destFolder,
    LR_export_useSubfolder = false,
    LR_collisionHandling = 'overwrite',
    LR_renamingTokensOn = false,        -- keep the original base filename
    LR_size_doConstrain = false,        -- full resolution
    LR_outputSharpeningOn = false,
    LR_removeLocationMetadata = false,  -- origin re-embeds rights regardless
    LR_reimportExportedPhoto = false,
    LR_embeddedMetadataOption = 'all',
  }
  if isJpeg then
    s.LR_format = 'JPEG'
    s.LR_jpeg_quality = 1.0
    s.LR_jpeg_useLimitSize = false
    s.LR_export_colorSpace = 'sRGB'
  else
    s.LR_format = 'TIFF'
    s.LR_export_bitDepth = 16
    s.LR_tiff_compressionMethod = 'compressionMethod_ZIP'
    s.LR_export_colorSpace = 'AdobeRGB'
  end
  return s
end

--- Render masters for the given photos into <mastersDir>, named by the GMP
--- reference: masters/<gmpRef(id)>.<ext> (the customer reference, not the camera
--- filename). Returns the count written. MUST run inside an async task (it
--- yields) — and must NOT be wrapped in pcall (Lua can't yield across pcall).
---
--- `progress` (optional) is a shared LrProgressScope spanning BOTH the JPEG and
--- TIFF passes: `doneBefore` is how many masters earlier passes already
--- processed and `grandTotal` the total across all passes, so the bar reads a
--- single continuous "N of TOTAL". Honors cancellation between renditions.
local function renderMasters(photos, isJpeg, mastersDir, secret, progress, doneBefore, grandTotal)
  if #photos == 0 then return 0, 0 end
  LrFileUtils.createAllDirectories(mastersDir)
  local ext = isJpeg and '.jpg' or '.tif'
  local label = isJpeg and 'JPEG' or 'TIFF'
  local session = LrExportSession({
    photosToExport = photos,
    exportSettings = masterExportSettings(isJpeg, mastersDir),
  })
  local written, processed = 0, 0
  for _, rendition in session:renditions() do
    if progress and progress:isCanceled() then break end
    local ok, pathOrMessage = rendition:waitForRender()
    if ok then
      local id = idFromFilename(rendition.photo:getFormattedMetadata('fileName') or '')
      local dest = LrPathUtils.child(mastersDir, Sha256.gmpRef(id, secret) .. ext)
      if LrFileUtils.exists(dest) then LrFileUtils.delete(dest) end
      if LrFileUtils.copy(pathOrMessage, dest) ~= false then
        LrFileUtils.delete(pathOrMessage)
      else
        LrFileUtils.delete(pathOrMessage)
      end
      written = written + 1
    end
    processed = processed + 1
    if progress then
      local done = doneBefore + processed
      progress:setPortionComplete(done, grandTotal)
      progress:setCaption(string.format('Exporting masters — %d of %d (%s)', done, grandTotal, label))
    end
  end
  return written, processed
end

--==================================================================--
-- Catalog rebuild
--==================================================================--

local ALL_TYPES = { 'print', 'fine-art', 'digital' }

--- Map a node name (collection OR set) to the shop product type(s) it grants.
--- A bucket named "All Formats" / "Everything" grants all three at once — so a
--- photo sold every way lives in ONE collection, not three. Otherwise loose
--- match: "Digital Downloads" → digital, "Fine Art" → fine-art, "Prints" /
--- "Posters" → print ("Fine Art Prints" resolves to fine-art — fine/frame is
--- checked before print). Returns a list, or nil if the name matches nothing.
local function nameToProductTypes(name)
  local s = slugify(name) or ''
  if s == 'all' or s == 'everything' or (s:find('all') and s:find('format')) then
    return ALL_TYPES
  end
  if s:find('digital') or s:find('download') then return { 'digital' } end
  if s:find('fine') or s:find('frame') then return { 'fine-art' } end
  -- The "Prints" line is presented to customers as "Posters"; accept either
  -- collection name. Both map to the internal 'print' product type.
  if s:find('print') or s:find('poster') then return { 'print' } end
  return nil
end

--- Collect every published collection in the service, each tagged with the
--- product type of the TOP-LEVEL node it descends from.
---
--- The product type is set once, at the top level — by a root collection's
--- own name, or by a root collection set's name. Everything nested inside a
--- top-level set inherits that set's type, so collection sets act purely as
--- organising folders (by shoot, location, theme — whatever you like).
local function gatherTypedCollections(publishService)
  local result = {}

  -- path = array of set/collection names below the product-type root node.
  local function descend(node, productTypes, path)
    if not productTypes then return end
    for _, collection in ipairs(node:getChildCollections()) do
      local fullPath = {}
      for _, p in ipairs(path) do fullPath[#fullPath + 1] = p end
      fullPath[#fullPath + 1] = collection:getName()
      result[#result + 1] = { collection = collection, productTypes = productTypes, path = fullPath }
    end
    if node.getChildCollectionSets then
      for _, set in ipairs(node:getChildCollectionSets()) do
        local newPath = {}
        for _, p in ipairs(path) do newPath[#newPath + 1] = p end
        newPath[#newPath + 1] = set:getName()
        descend(set, productTypes, newPath)
      end
    end
  end

  -- A collection placed directly under the service is typed by its own name.
  for _, collection in ipairs(publishService:getChildCollections()) do
    local t = nameToProductTypes(collection:getName())
    if t then result[#result + 1] = { collection = collection, productTypes = t, path = {} } end
  end
  -- A set under the service types everything inside; sets accumulate the path.
  if publishService.getChildCollectionSets then
    for _, set in ipairs(publishService:getChildCollectionSets()) do
      descend(set, nameToProductTypes(set:getName()), {})
    end
  end

  return result
end

--- Rebuild catalog.json from every published photo in the Shop service.
--- A photo's `offers` is the set of product types of the top-level buckets
--- (Prints / Fine Art / Digital Downloads) it appears under.
local function writeCatalog(publishService, dataDir)
  local activeCatalog = LrApplication.activeCatalog()
  local typed = gatherTypedCollections(publishService)

  local byId = {}
  local order = {}

  activeCatalog:withReadAccessDo(function()
    for _, tc in ipairs(typed) do
      for _, publishedPhoto in ipairs(tc.collection:getPublishedPhotos()) do
        local remoteId = publishedPhoto:getRemoteId()
        local photo = publishedPhoto:getPhoto()
        if remoteId and not photo:getRawMetadata('isVideo') then
          local fmt = photo:getRawMetadata('fileFormat')
          local isRaw = (fmt == 'RAW' or fmt == 'DNG')

          local entry = byId[remoteId]
          if not entry then
            entry = {
              id = remoteId,
              offers = {},
              category = {},
              rawAvailable = false,
              _seenOffer = {},
              _seenPath = {},
              _filled = false,
              _metaFromJpeg = false,
            }
            byId[remoteId] = entry
            order[#order + 1] = remoteId
          end

          -- A JPEG and its RAW share a filename → one id → one entry.
          -- The JPEG is the product; a RAW sibling only sets a flag.
          if isRaw then entry.rawAvailable = true end

          -- Fill metadata once; a JPEG overrides metadata taken from a RAW.
          if (not entry._filled) or ((not isRaw) and not entry._metaFromJpeg) then
            local dim = photo:getRawMetadata('croppedDimensions') or {}
            local title = photo:getFormattedMetadata('title')
            entry.slug = slugify(title) or remoteId:lower()
            entry.title = (title and title ~= '') and title or remoteId
            entry.caption = photo:getFormattedMetadata('caption') or ''
            entry.location = composeLocation(photo)
            entry.width = dim.width or 0
            entry.height = dim.height or 0
            -- Lightroom color label drives shop pricing markup (see the admin
            -- Prices tab) and the key/hero selection. Normalise to the five
            -- standard colors; custom/localised label names count as unlabelled.
            -- Compare case-insensitively so "Green"/"green" both work.
            local labelText = (photo:getFormattedMetadata('label') or ''):lower()
            local colorLabel = ''
            if labelText == 'red' or labelText == 'yellow' or labelText == 'green'
               or labelText == 'blue' or labelText == 'purple' then
              colorLabel = labelText
            end
            entry.colorLabel = colorLabel
            -- Green label also marks a photo as a key/hero image used as the
            -- rotating cover on folder cards.
            entry.key = (colorLabel == 'green')
            -- Capture date as seconds since LrDate epoch (Jan 1, 2001 UTC).
            -- Used by the shop frontend to sort photos chronologically within
            -- a collection. Falls back to 0 if EXIF data is absent.
            entry.captureDate = photo:getRawMetadata('dateTimeOriginal') or 0
            entry._filled = true
            if not isRaw then entry._metaFromJpeg = true end
          end

          -- Record the category path (deduplicated by path string).
          if #tc.path > 0 then
            local pathKey = table.concat(tc.path, '|')
            if not entry._seenPath[pathKey] then
              entry._seenPath[pathKey] = true
              entry.category[#entry.category + 1] = tc.path
            end
          end

          for _, productType in ipairs(tc.productTypes) do
            if not entry._seenOffer[productType] then
              entry._seenOffer[productType] = true
              entry.offers[#entry.offers + 1] = productType
            end
          end
        end
      end
    end
  end)

  -- Deduplicate slugs: when photos share a title-based slug, append the
  -- photo id so every slug is unique and stable across republishes.
  local slugCount = {}
  for _, id in ipairs(order) do
    local s = byId[id].slug
    slugCount[s] = (slugCount[s] or 0) + 1
  end
  for _, id in ipairs(order) do
    local entry = byId[id]
    if slugCount[entry.slug] > 1 then
      local idSlug = slugify(id) or id:lower()
      entry.slug = entry.slug .. '-' .. idSlug
    end
  end

  -- Sort all photos by capture date so collections display chronologically
  -- regardless of how Lightroom's internal collection order is set.
  table.sort(order, function(a, b)
    return (byId[a].captureDate or 0) < (byId[b].captureDate or 0)
  end)

  local photos = {}
  for _, id in ipairs(order) do
    local entry = byId[id]
    entry._seenOffer = nil
    entry._seenPath = nil
    entry._filled = nil
    entry._metaFromJpeg = nil
    photos[#photos + 1] = entry
  end

  local payload = {
    generated = LrDate.timeToW3CDate(LrDate.currentTime()),
    photos = photos,
  }

  local catalogPath = LrPathUtils.child(dataDir, 'catalog.json')
  local file, err = io.open(catalogPath, 'w')
  if not file then
    error('Could not write catalog.json: ' .. tostring(err))
  end
  file:write(jsonEncode(payload))
  file:close()

  return #photos
end

--- Published photos needing a master, deduped by id, into (jpegPhotos,
--- tiffPhotos, skippedJpeg, skippedTiff). JPEG master for all; 16-bit TIFF only
--- for RAW. Skips any whose master file already exists (incremental). Defined
--- here so it can see gatherTypedCollections above.
local function gatherMasterPhotos(publishService, mastersDir, secret)
  local typed = gatherTypedCollections(publishService)
  local jpegById, jpegIsRaw, tiffById = {}, {}, {}
  LrApplication.activeCatalog():withReadAccessDo(function()
    for _, tc in ipairs(typed) do
      for _, pubPhoto in ipairs(tc.collection:getPublishedPhotos()) do
        local id = pubPhoto:getRemoteId()
        local photo = pubPhoto:getPhoto()
        if id and not photo:getRawMetadata('isVideo') then
          local fmt = photo:getRawMetadata('fileFormat')
          local isRaw = (fmt == 'RAW' or fmt == 'DNG')
          if jpegById[id] == nil or (jpegIsRaw[id] and not isRaw) then
            jpegById[id] = photo
            jpegIsRaw[id] = isRaw
          end
          if isRaw and tiffById[id] == nil then tiffById[id] = photo end
        end
      end
    end
  end)
  -- Skip ids whose master already exists. Existence is keyed by the GMP ref
  -- (the master's filename) — computed here, outside the read-access block.
  local jpegPhotos, tiffPhotos = {}, {}
  local skippedJpeg, skippedTiff = 0, 0
  for id, p in pairs(jpegById) do
    local ref = Sha256.gmpRef(id, secret)
    if LrFileUtils.exists(LrPathUtils.child(mastersDir, ref .. '.jpg')) then
      skippedJpeg = skippedJpeg + 1
    else
      jpegPhotos[#jpegPhotos + 1] = p
    end
  end
  for id, p in pairs(tiffById) do
    local ref = Sha256.gmpRef(id, secret)
    if LrFileUtils.exists(LrPathUtils.child(mastersDir, ref .. '.tif')) then
      skippedTiff = skippedTiff + 1
    else
      tiffPhotos[#tiffPhotos + 1] = p
    end
  end
  return jpegPhotos, tiffPhotos, skippedJpeg, skippedTiff
end

--==================================================================--
-- Publish service provider
--==================================================================--

-- Cached publish service reference — set on first publish run, used by the
-- "Refresh catalog only" and "Export RAW TIFFs" buttons.
local cachedPublishService = nil

local provider = {}

-- Publish only — this service is not meant for ad-hoc Export.
provider.supportsIncrementalPublish = 'only'
provider.small_icon = nil
provider.supportsCustomSortOrder = false
provider.disableRenamePublishedCollection = false

-- Hide the export panels we control. The native "Image Sizing" panel is LEFT
-- VISIBLE so the preview size is adjustable there (defaults to 800px long edge;
-- keep it ≤800 — the origin also caps served previews at 800).
provider.hideSections = {
  'exportLocation', 'fileNaming', 'fileSettings',
  'outputSharpening', 'metadata', 'watermarking', 'video',
}
provider.allowFileFormats = { 'JPEG' }
provider.allowColorSpaces = { 'sRGB' }
provider.canExportVideo = true  -- we filter videos ourselves to avoid LR's own error dialog

-- Publish renders the web PREVIEW: sRGB JPEG, long edge 800px (Image Sizing
-- panel), written to <shopDataDir>/previews/<id>.jpg on the fast SSD. The
-- full-res masters (for downloads) are produced separately by the button.
provider.exportPresetFields = {
  { key = 'shopDataDir', default = '' },
  { key = 'mastersDir', default = '' },
  { key = 'sharedSecret', default = '' },
  { key = 'LR_format', default = 'JPEG' },
  { key = 'LR_jpeg_quality', default = 0.85 },
  { key = 'LR_jpeg_useLimitSize', default = false },
  { key = 'LR_export_colorSpace', default = 'sRGB' },
  { key = 'LR_size_doConstrain', default = true },
  { key = 'LR_size_maxWidth', default = 800 },
  { key = 'LR_size_maxHeight', default = 800 },
  { key = 'LR_size_units', default = 'pixels' },
  { key = 'LR_size_resolution', default = 240 },
  { key = 'LR_outputSharpeningOn', default = false },
  { key = 'LR_removeLocationMetadata', default = false },
}

function provider.getCollectionBehaviorInfo()
  return {
    defaultCollectionName = 'Digital Downloads',
    defaultCollectionCanBeDeleted = true,
    canAddCollection = true,
    -- Allow nested collection sets so photos can be filed into folders
    -- (by shoot, location, theme) inside each product-type bucket.
    maxCollectionSetDepth = 5,
  }
end

-- Editing these in Lightroom marks the photo for republish.
function provider.metadataThatTriggersRepublish()
  return {
    default = false,
    title = true,
    caption = true,
    location = true,
    gps = true,
    dateCreated = false,
  }
end

--- Settings UI shown at the top of the publish-service dialog.
function provider.sectionsForTopOfDialog(f, propertyTable)
  return {
    {
      title = 'Gus McEwan Shop',
      f:row {
        spacing = f:control_spacing(),
        f:static_text {
          title = 'Shop data folder:',
          alignment = 'right',
          width = LrView.share('shop_label'),
        },
        f:edit_field {
          value = LrView.bind('shopDataDir'),
          immediate = true,
          width_in_chars = 36,
          tooltip = 'catalog.json is written here (the LAN origin reads it).',
        },
        f:push_button {
          title = 'Choose…',
          action = function()
            local result = LrDialogs.runOpenPanel({
              title = 'Select the shop data folder',
              canChooseFiles = false,
              canChooseDirectories = true,
              allowsMultipleSelection = false,
            })
            if result and result[1] then
              propertyTable.shopDataDir = result[1]
            end
          end,
        },
      },
      f:static_text {
        title = 'Point this at the shop-data folder the LAN origin app reads.\n'
          .. 'Publishing writes catalog.json into it (fast SSD).',
        height_in_lines = 2,
        text_color = import('LrColor')(0.5, 0.5, 0.5),
      },
      f:row {
        spacing = f:control_spacing(),
        f:static_text {
          title = 'Masters folder:',
          alignment = 'right',
          width = LrView.share('shop_label'),
        },
        f:edit_field {
          value = LrView.bind('mastersDir'),
          immediate = true,
          width_in_chars = 36,
          tooltip = 'Full-resolution fulfilment masters are written here.',
        },
        f:push_button {
          title = 'Choose…',
          action = function()
            local result = LrDialogs.runOpenPanel({
              title = 'Select the fulfilment masters folder',
              canChooseFiles = false,
              canChooseDirectories = true,
              allowsMultipleSelection = false,
            })
            if result and result[1] then
              propertyTable.mastersDir = result[1]
            end
          end,
        },
      },
      f:static_text {
        title = 'Point this at the bulk fulfilment store root (e.g. /Volumes/shop).\n'
          .. 'The "Export masters" button writes full-res download masters to a\n'
          .. 'masters/ subfolder, named by GMP reference: masters/GMP-XXXXXXX.jpg\n'
          .. '(all) + masters/GMP-XXXXXXX.tif (RAW).',
        height_in_lines = 4,
        text_color = import('LrColor')(0.5, 0.5, 0.5),
      },
      f:row {
        spacing = f:control_spacing(),
        f:static_text {
          title = 'Shared secret:',
          alignment = 'right',
          width = LrView.share('shop_label'),
        },
        f:password_field {
          value = LrView.bind('sharedSecret'),
          immediate = true,
          width_in_chars = 36,
          tooltip = 'Must match the origin app’s SHARED_SECRET — used to name masters by GMP reference.',
        },
      },
      f:static_text {
        title = 'Must match the LAN origin’s SHARED_SECRET so master filenames\n'
          .. 'match the GMP references the shop uses. Leave blank only in dev.',
        height_in_lines = 2,
        text_color = import('LrColor')(0.5, 0.5, 0.5),
      },
      f:row {
        spacing = f:control_spacing(),
        f:push_button {
          title = 'Refresh catalog only',
          tooltip = 'Rewrite catalog.json from published photos without re-exporting any images.',
          action = function()
            local dataDir = propertyTable.shopDataDir
            if not dataDir or dataDir == '' then
              LrDialogs.message('Gus McEwan Shop', 'Set the shop data folder first.', 'critical')
              return
            end
            if not cachedPublishService then
              LrDialogs.message('Gus McEwan Shop',
                'Publish at least once to enable this shortcut — the service reference is not yet cached.',
                'info')
              return
            end
            LrTasks.startAsyncTask(function()
              writeCatalog(cachedPublishService, dataDir)
              LrDialogs.message('Gus McEwan Shop', 'catalog.json refreshed.', 'info')
            end)
          end,
        },
        f:push_button {
          title = 'Export masters',
          tooltip = 'Render the full-res download masters for published photos missing them: JPEG for all, 16-bit TIFF for RAW. Skips ones already present.',
          action = function()
            local dataDir = propertyTable.shopDataDir
            if not dataDir or dataDir == '' then
              LrDialogs.message('Gus McEwan Shop', 'Set the shop data folder first.', 'critical')
              return
            end
            if not cachedPublishService then
              LrDialogs.message('Gus McEwan Shop',
                'Publish at least once first — the service reference is not yet cached.', 'info')
              return
            end
            local mastersDir = mastersDirFor(propertyTable)
            local secret = propertyTable.sharedSecret
            -- Idle-context async task with its own function context: the render
            -- yields (so it must NOT be wrapped in pcall), and the context
            -- reports any error on its own.
            LrFunctionContext.postAsyncTaskWithContext('gmp-export-masters', function(context)
              local jpegPhotos, tiffPhotos, skipJpeg, skipTiff =
                gatherMasterPhotos(cachedPublishService, mastersDir, secret)
              if #jpegPhotos == 0 and #tiffPhotos == 0 then
                LrDialogs.message('Gus McEwan Shop',
                  'All masters are present — nothing to render.\n('
                  .. skipJpeg .. ' JPEG, ' .. skipTiff .. ' TIFF already there.)', 'info')
                return
              end
              -- A single cancelable progress bar (LrC's activity area, top-left)
              -- spanning both passes so the user sees "N of TOTAL" the whole way.
              local grandTotal = #jpegPhotos + #tiffPhotos
              local progress = LrProgressScope({
                title = 'Exporting download masters',
                functionContext = context,
              })
              progress:setCancelable(true)
              progress:setCaption(string.format('Exporting masters — 0 of %d', grandTotal))
              local nJpeg = renderMasters(jpegPhotos, true, mastersDir, secret, progress, 0, grandTotal)
              local nTiff = renderMasters(tiffPhotos, false, mastersDir, secret, progress, #jpegPhotos, grandTotal)
              local canceled = progress:isCanceled()
              progress:done()
              LrDialogs.message('Gus McEwan Shop — masters',
                (canceled and 'Export canceled early.\n\n' or '')
                .. 'Wrote ' .. nJpeg .. ' JPEG + ' .. nTiff .. ' TIFF master(s) to:\n'
                .. mastersDir .. '\n\nSkipped (already present): '
                .. skipJpeg .. ' JPEG, ' .. skipTiff .. ' TIFF.', 'info')
            end)
          end,
        },
      },
    },
  }
end

--- Main worker — runs once per published collection on Publish.
function provider.processRenderedPhotos(functionContext, exportContext)
  cachedPublishService = exportContext.publishService
  local exportSession = exportContext.exportSession
  local props = exportContext.propertyTable
  local dataDir = props.shopDataDir

  if not dataDir or dataDir == '' then
    LrDialogs.message('Gus McEwan Shop',
      'Set the shop data folder in the publish service settings before publishing.',
      'critical')
    return
  end

  -- Each Publish rendition is the 800px web PREVIEW. Write it to the fast SSD
  -- at <shopDataDir>/previews/<id>.jpg. (Full-res masters are made by the button.)
  local previewsDir = LrPathUtils.child(dataDir, 'previews')
  LrFileUtils.createAllDirectories(previewsDir)
  -- Publish only re-renders new/edited photos, so any photo here has changed —
  -- invalidate its masters so "Export masters" re-renders them.
  local mastersDir = mastersDirFor(props)

  local nPhotos = exportSession:countRenditions()
  local progress = exportContext:configureProgress({
    title = nPhotos == 1 and 'Publishing 1 photo to the shop'
      or ('Publishing ' .. nPhotos .. ' photos to the shop'),
  })

  -- Within a run, remember which ids already got a JPEG-sourced preview, so a
  -- RAW sibling never overwrites the JPEG's render.
  local jpegPreviewed = {}

  for _, rendition in exportContext:renditions({ stopIfCanceled = true }) do
    local ok, pathOrMessage = rendition:waitForRender()
    if ok then
      local photo = rendition.photo
      local filename = photo:getFormattedMetadata('fileName') or ''
      local id = idFromFilename(filename)

      if photo:getRawMetadata('isVideo') then
        -- Skip video files — mark as published so they leave the queue.
        if id ~= '' then rendition:recordPublishedPhotoId(id) end
      elseif id == '' then
        rendition:uploadFailed('Photo has no usable filename.')
      else
        local fmt = photo:getRawMetadata('fileFormat')
        local isRaw = (fmt == 'RAW' or fmt == 'DNG')

        -- This photo changed — drop its stale masters (named by GMP ref) so
        -- "Export masters" remakes them.
        deleteMasters(mastersDir, Sha256.gmpRef(id, props.sharedSecret))

        -- The JPEG sibling is the product. Skip the copy only if a JPEG of this
        -- id already wrote the preview and this rendition is its RAW sibling.
        if not (isRaw and jpegPreviewed[id]) then
          local destPath = LrPathUtils.child(previewsDir, id .. '.jpg')
          if LrFileUtils.exists(destPath) then
            LrFileUtils.delete(destPath)
          end
          local copied, copyErr = LrFileUtils.copy(pathOrMessage, destPath)
          if copied == false then
            rendition:uploadFailed('Could not copy preview: ' .. tostring(copyErr))
          else
            if not isRaw then jpegPreviewed[id] = true end
            rendition:recordPublishedPhotoId(id)
          end
        else
          rendition:recordPublishedPhotoId(id)
        end
      end
    else
      -- Silently skip videos that LR couldn't render rather than reporting an error.
      if rendition.photo:getRawMetadata('isVideo') then
        local vId = idFromFilename(rendition.photo:getFormattedMetadata('fileName') or '')
        if vId ~= '' then rendition:recordPublishedPhotoId(vId) end
      else
        rendition:uploadFailed(tostring(pathOrMessage))
      end
    end
  end

  -- Full-res masters (downloads) are made by the "Export masters" button — a
  -- Publish can't drive a second render, so they're a separate idle-context pass.

  -- Rebuild catalog.json from every Shop collection so it stays complete
  -- even when only one collection was just published.
  local total = writeCatalog(exportContext.publishService, dataDir)
  progress:setCaption('catalog.json updated — ' .. total .. ' photos for sale')
end

--- Remove a photo's preview and masters when it leaves a published collection.
function provider.deletePhotosFromPublishedCollection(publishSettings, arrayOfPhotoIds, deletedCallback)
  local dataDir = publishSettings.shopDataDir
  for _, photoId in ipairs(arrayOfPhotoIds) do
    if dataDir and dataDir ~= '' then
      local previewPath = LrPathUtils.child(
        LrPathUtils.child(dataDir, 'previews'), photoId .. '.jpg')
      if LrFileUtils.exists(previewPath) then
        LrFileUtils.delete(previewPath)
      end
      -- Remove the download masters (named by GMP ref) too.
      deleteMasters(mastersDirFor(publishSettings), Sha256.gmpRef(photoId, publishSettings.sharedSecret))
    end
    deletedCallback(photoId)
  end
  -- Rebuild catalog.json NOW so removed photos don't linger as ghost entries —
  -- their previews + masters were just deleted above, which would otherwise leave
  -- the catalog pointing at missing files (broken thumbnails in the shop). The
  -- live publish service is resolved by toolkit id. Best-effort (pcall): if it
  -- can't be resolved here, the catalog still rebuilds on the next Publish.
  if dataDir and dataDir ~= '' then
    pcall(function()
      local services = LrApplication.activeCatalog():getPublishServices('com.gusmcewan.shop')
      if services and #services > 0 then
        writeCatalog(services[1], dataDir)
      end
    end)
  end
end

return provider
