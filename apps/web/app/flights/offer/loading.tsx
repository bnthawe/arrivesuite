export default function Loading() {
  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-5 h-6 w-40 animate-pulse rounded bg-[#e3e3e3]" />
        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="h-48 animate-pulse rounded-[16px] border border-[#e3e3e3] bg-white" />
            <div className="h-52 animate-pulse rounded-[16px] border border-[#e3e3e3] bg-white" />
          </div>
          <div className="h-72 animate-pulse rounded-[16px] border border-[#e3e3e3] bg-white" />
        </div>
      </div>
    </main>
  );
}
