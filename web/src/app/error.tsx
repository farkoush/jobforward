"use client";

/**
 * Top-level error guard (FR-23, US2): whatever crashes inside the app tree,
 * the user sees one simple message and their session/draft state is NEVER
 * cleared — reloading brings them back exactly where they were.
 * English B1 per the owner's v1 language decision (2026-11-06).
 */

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[680px] px-5 py-8">
        <div role="alert" className="msg-error mb-6">
          <p>
            Something went wrong. Your work is safe — reload the page or try
            again.
          </p>
          <button className="btn-primary mt-3" onClick={reset}>
            Retry
          </button>
        </div>
      </div>
    </main>
  );
}
