import Head from "next/head";

export default function ServerError() {
  return (
    <>
      <Head>
        <title>500 — Server error | ChatVRM Agent</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-6 text-center text-slate-100">
        <p className="text-sm font-semibold uppercase tracking-widest text-rose-400">
          500
        </p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
          Something went wrong
        </h1>
        <p className="mt-4 max-w-md text-base text-slate-300">
          The server ran into an unexpected error. Please reload the page — if
          the problem persists, open an issue on GitHub.
        </p>
        <a
          href="https://github.com/badhope/ChatVRM-Agent/issues/new?template=bug_report.md"
          className="mt-8 inline-flex items-center rounded-md bg-rose-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-rose-400"
        >
          Report this on GitHub →
        </a>
      </main>
    </>
  );
}
