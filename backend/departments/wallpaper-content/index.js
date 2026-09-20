const router = require('./engine');

module.exports = {
  name: 'wallpaper-content',
  namespace: 'wallpaper-content',
  path: __dirname,
  description: 'Wallpaper catalog, storage, marketplace, and sharing domain',
  adapterPaths: [],
  ownedResponsibilities: ['catalog', 'installed-storage', 'uploads', 'sharing', 'health'],
  create() {
    return {
      name: 'wallpaper-content',
      compatibilityEngine: false,
      router,
      initializeDatabase() {
        return undefined;
      }
    };
  }
};