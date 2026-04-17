export default async function LiveEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return (
    <main className="px-4 py-6">
      <span className="font-label text-xs text-tertiary uppercase tracking-wider flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse inline-block" />
        Live Now
      </span>
      <h1 className="font-headline text-4xl font-bold mt-2">{eventId}</h1>
      <p className="text-on-surface-variant mt-2">Live event view — Phase 2</p>
    </main>
  )
}
