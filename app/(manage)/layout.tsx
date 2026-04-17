import { BottomNav } from '@/components/ui/BottomNav'

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 pb-20">
        {children}
      </div>
      <BottomNav variant="manage" />
    </div>
  )
}
