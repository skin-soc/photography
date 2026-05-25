--[[
  Gus McEwan Shop — publish service provider.

  On Publish, Lightroom renders each photo in the collection (JPEG, sRGB,
  long edge 2560px). This provider copies each rendered file into
  <shopDataDir>/previews/<id>.jpg and then rebuilds <shopDataDir>/catalog.json
  from every Shop published collection.

  The LAN origin app reads catalog.json + previews/ and serves the shop.
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
-- Catalog rebuild
--==================================================================--

local ALL_TYPES = { 'print', 'fine-art', 'digital' }

--- Map a node name (collection OR set) to the shop product type(s) it grants.
--- A bucket named "All Formats" / "Everything" grants all three at once — so a
--- photo sold every way lives in ONE collection, not three. Otherwise loose
--- match: "Digital Downloads" → digital, "Fine Art" → fine-art, "Prints" →
--- print ("Fine Art Prints" resolves to fine-art — fine/frame is checked
--- before print). Returns a list, or nil if the name matches nothing.
local function nameToProductTypes(name)
  local s = slugify(name) or ''
  if s == 'all' or s == 'everything' or (s:find('all') and s:find('format')) then
    return ALL_TYPES
  end
  if s:find('digital') or s:find('download') then return { 'digital' } end
  if s:find('fine') or s:find('frame') then return { 'fine-art' } end
  if s:find('print') then return { 'print' } end
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
            -- Green label marks a photo as a key/hero image used as rotating
            -- cover on folder cards. Compare case-insensitively so custom label
            -- names like "Green" or "green" both work.
            local labelText = (photo:getFormattedMetadata('label') or ''):lower()
            entry.key = (labelText == 'green')
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

--==================================================================--
-- Publish service provider
--==================================================================--

-- Cached publish service reference — set on first publish run, used by
-- the "Refresh catalog only" button so it can rewrite catalog.json without
-- re-exporting any photos.
local cachedPublishService = nil

local provider = {}

-- Publish only — this service is not meant for ad-hoc Export.
provider.supportsIncrementalPublish = 'only'
provider.small_icon = nil
provider.supportsCustomSortOrder = false
provider.disableRenamePublishedCollection = false

-- We control render settings; hide the export panels that don't apply.
provider.hideSections = {
  'exportLocation', 'fileNaming', 'fileSettings', 'imageSizing',
  'outputSharpening', 'metadata', 'watermarking', 'video',
}
provider.allowFileFormats = { 'JPEG' }
provider.allowColorSpaces = { 'sRGB' }
provider.canExportVideo = true  -- we filter videos ourselves to avoid LR's own error dialog

-- Fixed render: sRGB JPEG, long edge 2560px. The LAN origin app downsizes
-- further and applies the watermark, so previews here stay clean.
provider.exportPresetFields = {
  { key = 'shopDataDir', default = '' },
  { key = 'LR_format', default = 'JPEG' },
  { key = 'LR_jpeg_quality', default = 0.85 },
  { key = 'LR_jpeg_useLimitSize', default = false },
  { key = 'LR_export_colorSpace', default = 'sRGB' },
  { key = 'LR_size_doConstrain', default = true },
  { key = 'LR_size_maxWidth', default = 2560 },
  { key = 'LR_size_maxHeight', default = 2560 },
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
          tooltip = 'catalog.json and previews/ are written here.',
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
          .. 'Publishing writes catalog.json and previews/ into it.',
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

  local previewsDir = LrPathUtils.child(dataDir, 'previews')
  LrFileUtils.createAllDirectories(previewsDir)

  local nPhotos = exportSession:countRenditions()
  local progress = exportContext:configureProgress({
    title = nPhotos == 1 and 'Publishing 1 photo to the shop'
      or ('Publishing ' .. nPhotos .. ' photos to the shop'),
  })

  -- Within a publish run, remember which ids already got a JPEG-sourced
  -- preview, so a RAW sibling never overwrites the JPEG's render.
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
        -- The JPEG is the product. Skip the copy only if a JPEG of this id
        -- already wrote the preview and this rendition is its RAW sibling.
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

  -- Rebuild catalog.json from every Shop collection so it stays complete
  -- even when only one collection was just published.
  local total = writeCatalog(exportContext.publishService, dataDir)
  progress:setCaption('catalog.json updated — ' .. total .. ' photos for sale')
end

--- Remove a photo's preview when it leaves a published collection.
function provider.deletePhotosFromPublishedCollection(publishSettings, arrayOfPhotoIds, deletedCallback)
  local dataDir = publishSettings.shopDataDir
  for _, photoId in ipairs(arrayOfPhotoIds) do
    if dataDir and dataDir ~= '' then
      local previewPath = LrPathUtils.child(
        LrPathUtils.child(dataDir, 'previews'), photoId .. '.jpg')
      if LrFileUtils.exists(previewPath) then
        LrFileUtils.delete(previewPath)
      end
    end
    deletedCallback(photoId)
  end
  -- catalog.json is rebuilt on the next Publish.
end

return provider
