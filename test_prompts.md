# PawOS Test Prompts - Comprehensive Feature Testing

## Test 1: Basic Code Execution (Tests Governance & Interrupt)
```
Create a simple Node.js script that prints "Hello from PawOS" 10 times with 1 second delays between each print. Save it as hello.js and run it.
```

**What to test:**
- ✓ Governance approval appears (Allow Once, Allow Always, Deny buttons)
- ✓ Keyboard shortcuts work (Alt+Enter, Alt+,, Esc)
- ✓ "Work Finished" notification appears when done
- ✓ Try sending a new prompt while running → should interrupt with "Work Interrupted" notification
- ✓ Usage updates in real-time (watch the 5-hour PC counter)

---

## Test 2: File Operations (Tests Governance for Multiple Actions)
```
Create a new folder called "test-project" in the current directory, then create three files inside it:
1. package.json with basic Node.js config
2. index.js with a console.log statement
3. README.md with a description

Then list all files in the folder to confirm they were created.
```

**What to test:**
- ✓ Governance approval triggers for each file operation
- ✓ Test "Allow Always" (Alt+,) to auto-approve similar actions
- ✓ Usage counter reflects the work done
- ✓ Weekly usage percentage updates correctly
- ✓ Message display shows plain text (no cards/emojis)

---

## Test 3: Project Creation & Plan Proposal
```
Create a new React project structure for a todo-list app with:
- src/components/TodoList.jsx
- src/components/TodoItem.jsx
- src/App.jsx
- src/App.css
- public/index.html

After creating, propose a plan for implementing the todo functionality with add, delete, and mark complete features.
```

**What to test:**
- ✓ Governance approvals for multiple file creations
- ✓ Plan proposal feature works (should show proposal card)
- ✓ Real-time usage tracking across multiple actions
- ✓ Weekly hour limit display with conditional reset time (only after 100%)
- ✓ All notifications trigger correctly

---

## Test 4: Code Editing & Complex Workflow
```
In the test-project folder, create an index.js file that:
1. Defines a function to calculate factorial
2. Exports it as a module
3. Has proper error handling

Then create a test.js file that imports and tests the factorial function with values 1, 5, and 10. Run the test file to verify it works.
```

**What to test:**
- ✓ Governance approval for code writing (may require approval)
- ✓ Auto-interrupt: send a new prompt while this is running
- ✓ "Work Interrupted" notification should appear
- ✓ Usage continues to update accurately
- ✓ Notifications appear for all major events:
  - Governance approval needed
  - Work finished/interrupted
  - Connector events (if any)

---

## Feature Checklist During Testing

- [ ] **Governance Approval Panel**
  - [ ] Shows with correct header "PawOS needs your approval"
  - [ ] All 3 buttons visible (Allow Once, Allow Always, Deny)
  - [ ] Alt+Enter works for Allow Once
  - [ ] Alt+, works for Allow Always
  - [ ] Esc works for Deny
  
- [ ] **Notifications**
  - [ ] "PawOS Approval Needed" when governance panel appears
  - [ ] "Work Finished" or "Work Failed" when complete
  - [ ] "Work Interrupted" when new prompt sent during work
  
- [ ] **Usage Display**
  - [ ] 5-hour PC counter updates in real-time
  - [ ] Weekly hour counter updates in real-time
  - [ ] Percentage displays correctly
  - [ ] Reset time only shows after 100% exhaustion
  
- [ ] **Messages**
  - [ ] Plain text display (no card styling)
  - [ ] User messages aligned right
  - [ ] Agent messages aligned left
  - [ ] No emoji characters
  - [ ] Unicode symbols with muted colors
  
- [ ] **Auto-Interrupt**
  - [ ] New prompt cancels current work
  - [ ] "Work Interrupted" notification appears
  - [ ] Previous output still visible in chat
  
- [ ] **Keyboard Shortcuts**
  - [ ] Alt+Enter: Allow Once
  - [ ] Alt+,: Allow Always
  - [ ] Esc: Deny governance
  - [ ] No freezing or lag
