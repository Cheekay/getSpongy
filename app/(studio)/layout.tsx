import { BottomNav } from '@/components/ui/BottomNav'

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div id="main-content" className="flex-1 pb-20">
        {children}
      </div>
      <BottomNav variant="studio" />
    </div>
  )
}
