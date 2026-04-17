export default async function EventCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return (
    <main className="px-4 py-6">
      <h1 className="font-headline text-4xl font-bold text-primary">{code}</h1>
      <p className="text-on-surface-variant mt-2">Event entry — Phase 2</p>
    </main>
  )
}
