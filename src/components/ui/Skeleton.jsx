const Skeleton = ({ className = '' }) => (
  <div className={`bg-gray-200 rounded-xl animate-pulse ${className}`} />
)

export const PosSkeleton = () => (
  <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-gray-50/50">
    <div className="flex-1 flex overflow-hidden">
      <div className="w-full md:w-[60%] flex flex-col p-5 gap-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-24 rounded-full" />
          <Skeleton className="h-10 w-28 rounded-full" />
          <Skeleton className="h-10 w-20 rounded-full" />
          <Skeleton className="h-10 w-32 rounded-full" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-3 space-y-3">
              <Skeleton className="w-full aspect-square rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
      <div className="hidden md:block md:w-[40%] bg-white border-l border-gray-200 p-5 space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          </div>
        ))}
        <div className="border-t border-gray-100 pt-4 mt-4 space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
        <Skeleton className="h-14 w-full rounded-full mt-auto" />
      </div>
    </div>
  </div>
)

export const EcommerceSkeleton = () => (
  <div className="min-h-screen bg-gray-50/50 pb-24">
    {/* Header / Banner Skeleton */}
    <div className="relative w-full bg-gray-200">
      <Skeleton className="w-full h-44 sm:h-56 md:h-64 rounded-none" />
      <div className="max-w-4xl mx-auto px-4 relative -mt-12 sm:-mt-16 flex items-end justify-between">
        <div className="flex items-end gap-4">
          <Skeleton className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl border-4 border-white shadow-md bg-gray-300" />
          <div className="mb-2 space-y-2">
            <Skeleton className="h-6 w-40 sm:w-56" />
            <Skeleton className="h-4 w-28 sm:w-36" />
          </div>
        </div>
      </div>
    </div>

    {/* Categories Bar Skeleton */}
    <div className="max-w-4xl mx-auto px-4 mt-8">
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Skeleton className="h-10 w-28 rounded-full shrink-0" />
        <Skeleton className="h-10 w-32 rounded-full shrink-0" />
        <Skeleton className="h-10 w-24 rounded-full shrink-0" />
        <Skeleton className="h-10 w-36 rounded-full shrink-0" />
      </div>
    </div>

    {/* Product Grid Skeleton */}
    <div className="max-w-4xl mx-auto px-4 mt-6">
      <Skeleton className="h-6 w-36 mb-4" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4 items-center">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-5 w-20 pt-2" />
            </div>
            <Skeleton className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl shrink-0" />
          </div>
        ))}
      </div>
    </div>
  </div>
)

export default Skeleton

