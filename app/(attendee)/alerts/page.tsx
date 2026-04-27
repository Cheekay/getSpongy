export default function AlertsPage() {
  return (
    <main className="px-4 py-6 pb-24">
      <h1 className="font-headline text-2xl font-bold">Alerts</h1>
      <div className="mt-12 flex flex-col items-center text-center text-on-surface-variant">
        <p className="text-4xl mb-3">🔔</p>
        <p className="font-label font-semibold text-on-surface">No alerts yet</p>
        <p className="text-sm mt-1">Event updates and notifications will appear here.</p>
      </div>
    </main>
  )
}
