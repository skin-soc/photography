--[[
  Gus McEwan Shop — Lightroom Classic publish service.

  Publishing a collection renders web-sized previews of the photos in it and
  writes catalog.json to the shop-data folder that the LAN origin app reads.
  That is the entire "which photos are for sale" mechanism — drag a photo into
  a Shop published collection, hit Publish, and it appears in the online shop.
]]

return {
  LrSdkVersion = 14.0,
  LrSdkMinimumVersion = 6.0,

  LrToolkitIdentifier = 'com.gusmcewan.shop',
  LrPluginName = 'Gus McEwan Shop',

  LrExportServiceProvider = {
    title = 'Gus McEwan Shop',
    file = 'ShopPublishProvider.lua',
  },

  VERSION = { major = 0, minor = 1, revision = 3, build = 2 },
}
