import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/trash')({
  component: TrashComponent,
})

function TrashComponent() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">سلة المحذوفات</h1>
      <p className="text-gray-600">هذه صفحة سلة المحذوفات المعدلة بنجاح.</p>
    </div>
  )
}
