# Standard feature sequence

1. designer writes the spec in `docs/design/`
2. backend updates the API contract, if the feature changes it
3. backend and frontend implement in parallel, against that contract
4. designer reviews the implementation
5. frontend applies the feedback
6. devops updates pipeline, image and manifests if the feature needs it
7. the MR is opened

Not every feature involves every role. A style change does not need
devops; an infrastructure migration does not need the designer. Involve
only the roles the task actually touches.
