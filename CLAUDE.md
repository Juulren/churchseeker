# Delegation
- Delegate every repo search and test run to the Haiku 5.5 subagents (`search`, `grep`, `audit`) to keep the main context small.
- Ask the `advisor` (Opus 5.5) only: before a plan locks, when the same error shows up twice, before calling work done.
