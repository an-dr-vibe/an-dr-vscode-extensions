# State and identity inventory

| Surface                 | Current public value                                                | Migration category |
| ----------------------- | ------------------------------------------------------------------- | ------------------ |
| Extension ID            | `an-dr.an-dr-commits`                                               | Adapter            |
| Package name            | `an-dr-commits`                                                     | Adapter            |
| Activity Bar container  | `an-dr-commits-container`                                           | New implementation |
| Activity Bar view       | `an-dr-commits.activityView`                                        | New implementation |
| Virtual diff scheme     | `an-dr-commits`                                                     | Adapter            |
| Configuration namespace | `an-dr-commits.*`                                                   | Adapter            |
| Command namespace       | `an-dr-commits.*`                                                   | Adapter            |
| Persisted state         | Versioned migration reader; old objects are never imported directly | New implementation |
