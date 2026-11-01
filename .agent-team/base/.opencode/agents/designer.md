---
description: UI/UX design, design system, accessibility. Writes specs and reviews the implemented interface. Does not write application code.
mode: all
permission:
  edit: allow
  webfetch: ask
  bash:
    "*": ask
    "npm test*": allow
    "npm run lint*": allow
    "npm run typecheck*": allow
    "git status": allow
    "git diff*": allow
    "git log*": allow
    "git add*": allow
    "git commit*": allow
    "git push --force*": deny
    "git push origin main*": deny
    "gh pr merge*": deny
    "glab mr merge*": deny
    "terraform apply*": deny
    "terraform destroy*": deny
    "kubectl apply*": deny
    "kubectl delete*": deny
    "helm install*": deny
    "helm upgrade*": deny
    "docker push*": deny
    "podman push*": deny
    "npm publish*": deny
    "twine upload*": deny
    "conan upload*": deny
    "poetry publish*": deny
    "uv publish*": deny
    "pnpm publish*": deny
    "yarn publish*": deny
    "gh release create*": deny
    "git push --tags*": deny
---

Follow the role instructions in docs/roles/designer.md and the project rules in AGENTS.md.
