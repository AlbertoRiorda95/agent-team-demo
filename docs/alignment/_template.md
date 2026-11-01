---
status: open            # open | resolved
date: YYYY-MM-DD
author: <role that made the change>
task: <issue or task id>
mr: <link to the MR, if any>
breaking: no            # yes if another role's code stops working without changes
affects: []             # roles that must adapt, for example [frontend, devops]
decision-needed: no     # set by designer: yes if the user must decide
---

## What changed
<one or two sentences>

## What the others relied on (before → after)
<for example: GET /api/profile returns `fullName` → returns `firstName` and `lastName`>

## Follow-up actions
<!-- written by designer, one checkbox per affected role -->
- [ ] frontend: ...

## Resolution
<!-- filled in when status becomes resolved -->
