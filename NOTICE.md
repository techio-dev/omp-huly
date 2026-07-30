# NOTICE — omp-huly license attribution

> R1 license audit (T-37). Verified 2026-07-27 qua npm package.json metadata.
> Technical analysis, KHÔNG phải legal advice. Maintainer final review.

## omp-huly (MIT)

- **License**: [MIT](./LICENSE) © 2026 can1357
- **Source**: <https://github.com/techio-dev/omp-huly>
- **Lineage**: Fork of [pi-huly](https://github.com/naicoi92/pi-huly) (MIT © naicoi92)
  which targets [pi-coding-agent](https://github.com/earendil-works/pi-coding-agent) (Pi by Mario).
  omp-huly retargets pi-huly to [oh-my-pi](https://github.com/techio-dev/oh-my-pi) (omp), can1357's Pi fork.

## Runtime dependencies (EPL-2.0, npm public)

omp-huly declare `@hcengineering/*` là `dependencies` trong `package.json`.
Consumer `omp install npm:omp-huly` → npm auto-install `@hcengineering/*` từ
npmjs.org (publishConfig access public, verified T-37) → KHÔNG cần GitHub
Packages token (NFR-06). `dist/index.mjs` KHÔNG bundle @hcengineering — code
`import` từ `node_modules/@hcengineering/*` runtime (rolldown external).

| Package | Version | License | npm |
|---|---|---|---|
| `@hcengineering/api-client` | ^0.7.423 | **EPL-2.0** | <https://www.npmjs.com/package/@hcengineering/api-client> |
| `@hcengineering/core` | ^0.7.423 | **EPL-2.0** | <https://www.npmjs.com/package/@hcengineering/core> |
| `@hcengineering/platform` | ^0.7.423 | **EPL-2.0** | <https://www.npmjs.com/package/@hcengineering/platform> |
| `@hcengineering/text-core` | ^0.7.423 | **EPL-2.0** | <https://www.npmjs.com/package/@hcengineering/text-core> |
| `@hcengineering/text-markdown` | ^0.7.423 | **EPL-2.0** | <https://www.npmjs.com/package/@hcengineering/text-markdown> |

### EPL-2.0 obligations

1. **Attribution** (§3.6): this NOTICE discloses EPL-2.0 dependencies.
2. **Source availability** (§3.6): consumer install `@hcengineering/*` từ npm
   (public, source included trong tarball npm). omp-huly KHÔNG vendor source.
3. **No additional restrictions** (§7): EPL-2.0 permit commercial use,
  modification, distribution với attribution + source availability.

### MIT compat EPL-2.0

- omp-huly (MIT) depends on @hcengineering (EPL-2.0) runtime. Dist bundle chỉ
  chứa code omp-huly (MIT). @hcengineering code ở node_modules riêng.
- EPL-2.0 copyleft KHÔNG lan sang omp-huly source (separate distribution).
- `LICENSE` (MIT) áp dụng cho omp-huly. `@hcengineering/*` subject EPL-2.0
  riêng (npm package license field).

### EPL-2.0 full text

<https://www.eclipse.org/legal/epl-2.0/>

## External dependencies (MIT, KHÔNG bundled)

| Package | License |
|---|---|
| `ws` | MIT (<https://www.npmjs.com/package/ws>) |
| `zod` | MIT (<https://www.npmjs.com/package/zod>) |
| `@oh-my-pi/pi-coding-agent` | MIT (<https://github.com/techio-dev/oh-my-pi>) |
| `@oh-my-pi/pi-agent-core` | MIT |
| `@oh-my-pi/pi-tui` | MIT |

DevDependencies (oxlint, oxfmt, rolldown, vitest, typescript, markdownlint-cli2,
@vitest/coverage-v8) đều MIT. KHÔNG ship trong tarball.

## R1 conclusion

**Accept**: bundle approach hợp lệ với attribution (this NOTICE) +
source-availability (npm packages public). KHÔNG block release. Maintainer
responsibility: final legal review trước publish.

## Reference

- Upstream pi-huly design `03-tech-stack.md` §4 (R1 risk assessment)
- Upstream pi-huly design `08-non-functional.md` §A (Dependency CVE + license)
- Upstream pi-huly design `10-release.md` §A (Pre-Release Audit R1)
