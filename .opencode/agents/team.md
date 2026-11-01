---
description: A team task, one issue across several roles, done alone without delegating. Only when the user asks for it (agent:team).
mode: all
permission:
  edit: allow
  task: deny
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

Follow the instructions in docs/roles/team.md and the project rules in AGENTS.md.
You never start other agents: you do every part yourself.
