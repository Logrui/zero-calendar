import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { MultiCalendarView } from "@/components/multi-calendar-view"
import { getEvents, getUserCategories, syncWithGoogleCalendar } from "@/lib/calendar"
import { CalendarHeader } from "@/components/calendar-header"
import { Sidebar } from "@/components/sidebar"

export default async function CalendarPage() {
  const session = await getServerSession(authOptions)

  if (!session || !session.user) {
    redirect("/auth/signin")
  }

  const userId = session.user.id

  const start = new Date()
  start.setFullYear(start.getFullYear(), 0, 1)
  const end = new Date()
  end.setFullYear(end.getFullYear() + 1, 11, 31)

    await syncWithGoogleCalendar(userId);

  const [events, categories] = await Promise.all([
    getEvents(userId, start, end),
    getUserCategories(userId),
  ])

  
  return (
    <div className="flex h-screen flex-col">
      <CalendarHeader />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden p-4">
          <MultiCalendarView
            initialEvents={events}
            initialCategories={categories.map((c) => c.name)}
          />
        </main>
      </div>
    </div>
  )
}
