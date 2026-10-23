# SISTec Online Examination Portal

A complete online examination website built with **only HTML, CSS and Vanilla JavaScript**. No backend, no database server, no build step, no paid service. It runs directly on **GitHub Pages**.

## Features

- Student information page with validation and an examination-instructions popup
- 50 MCQs + 10 theory questions on C++ (tokens, precedence & associativity, program structure, data types, variables, operators, expressions, control statements, I/O, arrays, functions, classes & objects, scope resolution operator, constructors & destructors)
- MCQ interface: highlighted answers, Previous / Next, Clear Answer, Mark for Review, question palette, animated progress bar, marks per question
- Theory answers by **photo upload**: file picker, mobile camera capture, drag-and-drop, preview, multiple photos per question, replace / remove, page numbering, type (JPG, JPEG, PNG, WebP) and size validation
- Countdown timer (hours : minutes : seconds), 5-minute and 1-minute warnings, auto-submit at zero, deadline stored as a timestamp so **refreshing never restarts the timer**
- Submission confirmation popup, locked test after submission
- Results dashboard with print-friendly layout (Print Result button)
- Progress saved locally: LocalStorage (details, answers, status, review marks, deadline, submission) and IndexedDB (photographs)

## Important: how data is stored

Everything is saved **in the student's own browser, on that device only**.

- Answers and photographs are **not sent to the teacher or to any server.**
- Data does not move to another browser or device.
- Clearing browser data, or using a private/incognito window, can erase progress.
- Because there is no server, the exam is **not tamper-proof**: a determined student could edit local data with browser developer tools. Use this portal for practice tests or low-stakes assessments, or supervise it in a lab.
- After the test, students should click **Print Result** (and choose *Save as PDF*) or take a screenshot and hand it in as you instruct. Handwritten answer photographs must be collected separately (for example, the teacher asks students to show or send their handwritten sheets).

## Project files

```
exam-portal/
├── index.html      Page structure
├── style.css       Design, animations, responsive and print styles
├── script.js       Exam logic (timer, storage, photos, results)
├── questions.js    Questions, answers and exam settings (edit this)
└── README.md
```

All paths are relative, so the site works on GitHub Pages without changes. You can also test it locally by double-clicking `index.html`.

## Deploy on GitHub Pages

1. **Create a repository**
   - Sign in at <https://github.com> and click **New repository**.
   - Name it, for example, `exam-portal`. Choose **Public**. Click **Create repository**.
2. **Upload the five files**
   - On the new repository page click **uploading an existing file** (or **Add file → Upload files**).
   - Drag in `index.html`, `style.css`, `script.js`, `questions.js` and `README.md`. They must be in the **repository root** (not inside another folder).
   - Click **Commit changes**.
3. **Enable GitHub Pages**
   - Open **Settings → Pages**.
   - Under **Build and deployment**, set **Source** to **Deploy from a branch**.
   - Choose branch **main** and folder **/ (root)**, then click **Save**.
4. **Open the website**
   - Wait 1 to 2 minutes. Refresh the Pages settings screen; a banner shows the address:
     `https://<your-username>.github.io/exam-portal/`
   - Share this link with students.
5. **Update questions or exam duration later**
   - In the repository, open `questions.js` and click the pencil (✏) icon to edit.
   - Make your changes and click **Commit changes**, wait about a minute, then hard-refresh the page (Ctrl + F5).

## Editing `questions.js`

**Exam duration** (top of the file):

```js
duration: { hours: 2, minutes: 0, seconds: 0 },
```

Other settings there: default subject and test name, warning times, maximum photo size (`maxFileSizeMB`), maximum photos per question, and `negativeMarks` (marks deducted per wrong MCQ; `0` means none).

**Add an MCQ** (`3` means option D is correct; options are numbered 0, 1, 2, 3 for A, B, C, D):

```js
mcq("Which keyword defines a class?", ["struct only", "class", "object", "define"], 1);
```

An optional fourth value sets the marks, for example `mcq("...", [...], 1, 2);`.

**Add a theory question** (5 marks by default):

```js
theory("Explain the scope resolution operator with an example.", 5);
```

Wrap code in backticks to format it as code: ``"What does `cout << x;` print?"``

To remove a question, delete its line. Question numbers and ids are assigned automatically.

> If you change the question paper after students have started, their saved attempts on the old paper are cleared automatically the next time they open the page.

## Browser support

Any modern browser (Chrome, Edge, Firefox, Safari) on computers and phones. Camera capture works on phones and tablets that support it. If a browser blocks IndexedDB (some private modes), photographs are kept in memory only and the student is warned that a refresh would lose them.
