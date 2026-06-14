import Link from "next/link";
import Head from "next/head";

export default function NotFound() {
  return (
    <>
      <Head>
        <title>404 — Page not found | ChatVRM Agent</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-6 text-center text-slate-100">
        <p className="text-sm font-semibold uppercase tracking-widest text-sky-400">
          404
        </p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Page not found</h1>
        <p className="mt-4 max-w-md text-base text-slate-300">
          The page you are looking for does not exist, or it has been moved.
          Head back to the conversation and try again.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center rounded-md bg-sky-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400"
        >
          ← Back to ChatVRM Agent
        </Link>
      </main>
    </>
  );
}
