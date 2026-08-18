// Shimmer placeholders for the hero and shelves while the archive index loads.

export function CardSkeleton({ i }: { i: number }) {
  return (
    <div className="card" style={{ animationDelay: `${i * 60}ms` }}>
      <div className="card-art"><div className="skel absolute inset-0 rounded-none" /></div>
    </div>
  );
}

export function ShelfSkeleton({ label }: { label: string }) {
  return (
    <section className="shelf reveal-on-scroll">
      <div className="shelf-head">
        <span className="shelf-tick" />
        <span className="eyebrow">{label}</span>
      </div>
      <div className="shelf-track">
        {Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} i={i} />)}
      </div>
    </section>
  );
}

export function HeroSkeleton() {
  return (
    <section className="hero">
      <div className="skel absolute inset-0 rounded-none opacity-60" />
      <div className="hero-shade" />
      <div className="hero-bar top" />
      <div className="hero-bar bottom" />
      <div className="hero-content left-[4vw] right-[4vw] bottom-[16vh] max-w-2xl">
        <div className="skel h-3.5 w-40 mb-5" />
        <div className="skel h-12 w-[min(480px,70vw)] mb-4" />
        <div className="skel h-3 w-72 mb-7" />
        <div className="flex gap-3">
          <div className="skel h-11 w-36 !rounded-full" />
          <div className="skel h-11 w-32 !rounded-full" />
        </div>
      </div>
    </section>
  );
}

export function HomeSkeleton() {
  return (
    <>
      <HeroSkeleton />
      <div className="pt-8">
        <ShelfSkeleton label="Latest recordings" />
        <ShelfSkeleton label="The archive" />
      </div>
    </>
  );
}
