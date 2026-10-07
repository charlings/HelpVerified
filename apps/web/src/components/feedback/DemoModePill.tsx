/**
 * Shown whenever the app runs against mock data, so nobody mistakes it for a live service.
 * An <aside> landmark so the notice isn't orphaned outside the page's landmarks.
 */
export function DemoModePill() {
  return (
    <aside
      aria-label="Demo mode"
      className="pointer-events-none fixed right-3 bottom-20 z-50 rounded-full bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white shadow-md md:bottom-4"
    >
      Demo mode · data is not real
    </aside>
  );
}
