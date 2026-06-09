# Security

Found a hole? **Don't file a public issue.** Open a private security
advisory or email me (the address is in `CITATION.cff` if there's one;
otherwise it's on my profile page). I prefer the advisory form because
GitHub handles the disclosure timeline.

What I'll do:

- Reply within 3 business days.
- Triage and try to reproduce within 10 business days.
- Ship a fix, or at least a documented mitigation, as soon as I can.
- Credit you in the advisory if you want it. Say "anonymous" if you don't.

I follow responsible disclosure: please keep the report private until I
publish a fix and (if needed) a CVE / advisory. I won't sue you for
security research done in good faith, and I won't go after security
researchers for things that are obviously bugs.

## What I patch

Only the latest commit on `main`. I don't backport. If you're on an
older version, the right fix is to upgrade.

## In scope

- Code in this repository.
- Official container images and release artifacts that came from this
  repo (when they exist).

## Out of scope

- Third-party dependencies. Report upstream unless I pinned and shipped
  a vulnerable version myself.
- Scanners, social engineering, DoS, or "you used a default port".
