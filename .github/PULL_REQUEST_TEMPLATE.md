---
name: Pull request
about: Use this template for all pull requests
---

## Summary

<!-- One or two sentences describing what this PR changes. -->

## Related issue

<!-- Link to the issue this PR fixes or references, if any.
     Use `Fixes #123` or `Closes #123` to auto-close the issue. -->

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing behavior to
      change)
- [ ] Documentation update
- [ ] Refactor / chore (no functional change)

## How has this been tested?

<!-- Describe the tests you ran. Include commands and what you saw. -->

- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Manual testing in `npm run dev`:
  - [ ] Voice input works
  - [ ] LLM reply works
  - [ ] TTS playback works
  - [ ] Lip sync & idle motion still work

## Screenshots / recordings

<!-- If the change is visible in the UI, attach before/after media. -->

## Checklist

- [ ] My code follows the existing style (`.editorconfig`, ESLint)
- [ ] I have updated the relevant documentation
  - [ ] `README.md` (English)
  - [ ] `README.zh.md` (Chinese)
  - [ ] `README.ja.md` (Japanese)
- [ ] I have added / updated tests where it makes sense
- [ ] I have not introduced new warnings in the build output
- [ ] I have not committed any secrets (`.env`, API keys, tokens)
