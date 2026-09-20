/**
 * Tiny on-screen build stamp for phones/tablets — which deploy is this device running? "styles"
 * reads "ok" only when the newest stylesheet has loaded (its rule replaces the "old" text), so a
 * stale stylesheet and stale page code can be told apart at a glance. Touch devices only (CSS).
 */
export default function BuildStamp() {
  return (
    <div className="build-stamp">
      Build {process.env.NEXT_PUBLIC_BUILD_ID} · {process.env.NEXT_PUBLIC_BUILD_TIME} · styles <span className="build-css">old</span>
    </div>
  )
}
