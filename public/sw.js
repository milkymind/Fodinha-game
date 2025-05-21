// Service Worker for Fodinha Card Game
const CACHE_NAME = 'fodinha-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/_next/static/chunks/main.js',
  '/_next/static/chunks/webpack.js',
  '/_next/static/css/app.css',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => {
          return name !== CACHE_NAME;
        }).map((name) => {
          return caches.delete(name);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-first strategy for API requests
const apiNetworkFirst = async (request) => {
  try {
    const networkResponse = await fetch(request);
    // Only cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
};

// Determine which strategy to use based on request type
const getStrategy = (request) => {
  const url = new URL(request.url);
  
  // Skip caching for socket.io requests
  if (url.pathname.includes('/socket.io') || url.pathname.includes('/api/socket')) {
    return fetch(request);
  }
  
  // Skip caching for WebSocket connections
  if (request.headers.get('Upgrade') === 'websocket') {
    return fetch(request);
  }
  
  // Network-first for API requests
  if (url.pathname.startsWith('/api/')) {
    return apiNetworkFirst(request);
  }
  
  // Cache-first for static assets
  return caches.match(request).then((cachedResponse) => {
    if (cachedResponse) {
      return cachedResponse;
    }
    return fetch(request).then((response) => {
      if (!response || response.status !== 200 || response.type !== 'basic') {
        return response;
      }
      
      const responseToCache = response.clone();
      caches.open(CACHE_NAME).then((cache) => {
        cache.put(request, responseToCache);
      });
      
      return response;
    });
  });
};

// Fetch event - intercept network requests
self.addEventListener('fetch', (event) => {
  event.respondWith(getStrategy(event.request));
});

// Handle offline status
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'OFFLINE_STATUS') {
    // Notify all clients about network status
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'NETWORK_STATUS',
          payload: {
            isOffline: event.data.payload.isOffline
          }
        });
      });
    });
  }
}); 