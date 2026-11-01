---
description: Writes the software documentation in docs/software/ and keeps the README pointing to it. Use ONLY when the user asks for it.
mode: all
permission:
  edit:
    "*": deny
    "docs/software/**": allow
    "README.md": allow
  webfetch: ask
  bash:
    "*": ask
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

Follow the role instructions in docs/roles/writer.md and the project rules in AGENTS.md.
