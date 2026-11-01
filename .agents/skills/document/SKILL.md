---
name: document
description: Write or update the software documentation (design document, ICD, user manual, install and operations guide, API guide) by handing the work to the writer agent. Use when the user asks for documentation of the application.
argument-hint: "[design | icd | user-manual | operate | api | all]"
disable-model-invocation: true
---

Have the documentation of the application written or brought up to date.
Documents asked for, if given: $ARGUMENTS

1. **Choose.** Name the document types: those in $ARGUMENTS, or ask the user
   (numbered, with the ones in `docs/software/README.md` recommended).
   `all` is every wanted document of `docs/software/README.md`.
2. **Check what exists.** For each document, say whether it is new or an
   update, and the commit it was written against (its first lines).
3. **Delegate to the `writer` agent**, one message with the documents, and
   its role file `docs/roles/writer.md`. Do not write the documents in this
   session: the writer reads the code in its own context.
4. **Report** what changed in `docs/software/` and in the README, the open
   questions the writer raised, and where the documentation differs from a
   spec or the contract. Remind the user that the reference is generated from
   the code by the CI (`ci/reference.sh`, artifact `reference-docs`) and is
   not written by hand; run `./ci/reference.sh` to build it here.
5. Commit nothing: the user reviews the changes. On a team with a tracker, a
   task for the `writer` role does the same in CI or in an orchestrator.
