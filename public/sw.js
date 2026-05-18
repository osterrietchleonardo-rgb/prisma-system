// PRISMA IA - Service Worker para Web Push Notifications
// Maneja notificaciones push en background (celular, PC, tablet)

self.addEventListener('push', function (event) {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'PRISMA IA', body: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: '/icon-192.png',   // usa el ícono de tu PWA
    badge: '/icon-72.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/asesor/dashboard' },
    actions: data.actions || [],
    tag: data.tag || 'prisma-notification',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'PRISMA IA', options)
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/asesor/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
