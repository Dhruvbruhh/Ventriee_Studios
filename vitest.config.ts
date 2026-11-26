import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Keep the suite scoped to product code. .claude/worktrees holds other
    // sessions' working copies; their tests run in their own contexts.
    exclude: [
      '**/node_modules/**',
      '**/out/**',
      '**/dist/**',
      '**/build/**',
      '**/dist-update-test/**',
      '.claude/**',
    ],
  },
})
