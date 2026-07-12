/**
 * Premium loading skeleton components for the archive.
 * Provides smooth, shimmer-animated placeholders during data loading.
 */

export function StreamCardSkeleton() {
  return (
    <div className="card-surface overflow-hidden">
      {/* Thumbnail placeholder */}
      <div className="relative aspect-video bg-[var(--bg-elevated)] overflow-hidden">
        <div className="absolute inset-0 skeleton-shimmer" />
      </div>

      {/* Content placeholder */}
      <div className="px-4 py-3 space-y-2">
        <div className="h-4 bg-[var(--bg-elevated)] rounded skeleton-shimmer w-3/4" />
        <div className="h-3 bg-[var(--bg-elevated)] rounded skeleton-shimmer w-1/2" />
        <div className="flex gap-2 mt-3">
          <div className="h-5 bg-[var(--bg-elevated)] rounded-full skeleton-shimmer w-16" />
          <div className="h-5 bg-[var(--bg-elevated)] rounded-full skeleton-shimmer w-20" />
        </div>
      </div>
    </div>
  );
}

export function FeaturedStreamSkeleton() {
  return (
    <div className="relative rounded-2xl overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
      {/* Hero image placeholder */}
      <div className="relative aspect-video lg:aspect-[21/9] bg-[var(--bg-elevated)] overflow-hidden">
        <div className="absolute inset-0 skeleton-shimmer" />

        {/* Overlay gradient placeholder */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-surface)] via-transparent to-transparent" />
      </div>

      {/* Content placeholder */}
      <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-8 space-y-3">
        <div className="h-6 bg-[var(--bg-elevated)] rounded skeleton-shimmer w-1/4" />
        <div className="h-8 bg-[var(--bg-elevated)] rounded skeleton-shimmer w-2/3" />
        <div className="h-4 bg-[var(--bg-elevated)] rounded skeleton-shimmer w-1/3" />
        <div className="flex gap-3 mt-4">
          <div className="h-10 bg-[var(--bg-elevated)] rounded-full skeleton-shimmer w-28" />
          <div className="h-10 bg-[var(--bg-elevated)] rounded-full skeleton-shimmer w-24" />
        </div>
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <StreamCardSkeleton key={i} />
      ))}
    </>
  );
}

export function HeroStatsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="glass-premium rounded-xl p-4 border border-[var(--border-subtle)]"
        >
          <div className="h-8 bg-[var(--bg-elevated)] rounded skeleton-shimmer w-2/3 mb-2" />
          <div className="h-3 bg-[var(--bg-elevated)] rounded skeleton-shimmer w-1/2" />
        </div>
      ))}
    </div>
  );
}
