# Writing the explainer

Your readers range from people who have never seen code to senior engineers. Aim for what a skilled technical writer would produce: every sentence earns its place, explains *why*, and is exactly true.

## Process

1. **Outline as reader questions.** Before writing, list the questions a newcomer would ask, in the order they would ask them: what is this for, what are the parts, what happens when I use it, what can go wrong, where do I start reading the code. Each top-level section answers one question. Section titles are short (they sit in the page's top bar); a question can go in the section `summary`.
2. **Draft one chapter.** Read the relevant code, then write that chapter's blocks in its own JSON file. Prefer a diagram, table or code block where it says more than prose. Validate the manifest and revise this chapter before moving to the next.
3. **Check facts.** Every claim must match code you have read. Do not describe behaviour from names alone. If you are unsure, read more or leave the claim out.
4. **Edit as two readers.** After revising individual chapters, review the whole book for gaps, repetition and inconsistent names. Reread once as a newcomer (is anything unexplained or assumed?) and once as a senior engineer on this codebase (is anything wrong, vague or padded?). Then cut: a first draft is usually a third too long.

## Structure

1. **Open with the big picture.** One or two sentences on what the subject does and why it exists. `stats` and `cards` give a quick sense of shape.
2. **Introduce the main pieces** with a high-level `graph` or `cards`, then go one level deeper.
3. **Walk through one concrete path**, such as a request, a command or a user action, using `steps` or `sequence`. A real example teaches better than an inventory.
4. **Put depth in layers.** Keep the main text simple. Put edge cases, internals and full file lists in `details`, `tabs` or entity `details`.
5. **Use what fits the content.** There are no required sections. For a learning audience, a short `quiz` at the end of a section helps the ideas stick.

## Explain intent, not code

Readers can see *what* the code does by reading it. Your job is to tell them *why*.

- Lead with purpose or consequence, then the mechanism: "To make a crash lose at most a quarter of a second of text, progress is saved every 250 ms."
- When the code reflects a decision, name the trade-off or the alternative it avoids: "Saving on every token would hammer the database, so progress is saved every 250 ms instead."
- Never narrate code line by line ("first it calls X, then it checks Y"). In a code walkthrough, each step says what that part achieves and why it is there.
- Point out what is surprising, deliberate or easy to get wrong. That is what readers cannot get from skimming the code.

## Length budgets

| Text | Budget |
| --- | --- |
| Entity `summary` | One sentence, at most 25 words, understandable without jargon |
| Section `summary` | At most 30 words |
| `prose` paragraph | At most 4 sentences, one idea |
| Step `text` | At most 50 words |
| Sequence `note`, code annotation `note` | At most 20 words |
| Caption | One sentence |
| Callout | At most 3 sentences |

Deeper material goes into entity `details` or a `details` block, not into longer summaries.

## Say each thing once

- If a diagram shows something, the prose must not restate it. Prose adds what the diagram cannot: why it is shaped that way, what to notice, what is missing on purpose.
- A caption tells the reader where to look ("Nothing calls the database directly; everything goes through ChatRepository"). It does not repeat the title or describe the diagram's type.
- Sequence notes, step texts and prose about the same flow must not overlap. Decide which block carries the explanation and keep the others short.
- One name per thing. Once you call it "the reply", do not switch to "the response", "the answer" and "the message". Use entity references (`[[id]]`) so the name is always the same.

## Two audiences in one text

- The first sentence of every summary, section opening and step must make sense to someone who does not program. Engineer-level detail follows.
- Define a technical term the first time it appears, in a few words, or put it in a `glossary`. Prefer plain words when they are just as exact: "saved" over "persisted", "start" over "bootstrap".
- Do not explain what every engineer knows (what a function or a database is). Do explain what is specific to this codebase.

## Concrete and exact

- Use real values and names: "every 250 ms", "16 KB", "10 requests at once", "`ChatRepository`". Not "periodically", "bounded" or "a storage layer".
- Prefer one worked example (this request, this file, this user action) over a general description.
- State facts plainly. Do not hedge ("can potentially", "might help to") when you have read the code; do not claim what you have not verified.

## Words and patterns to avoid

- Filler: "This section explains", "Let's dive in", "It is worth noting that", "In summary", "As mentioned above", "Basically".
- Empty praise: robust, seamless, powerful, elegant, comprehensive, cutting-edge, simply, leverage, utilise.
- Inflated verbs: "is responsible for handling" (say "handles"), "serves as" (say "is"), "in order to" (say "to").
- Rhetorical constructions: "It's not X, it's Y", rhetorical questions in body text, lists of three adjectives.
- Telling instead of showing: "This is important because..." (say why directly).

## Rewrites

| Weak | Strong |
| --- | --- |
| "The `generateResponse` function handles streaming by collecting events and periodically saving them to the repository." | "The reply is saved at most every 250 ms while it streams, so a crash loses a quarter of a second of text at most, without writing to the database on every token." |
| "ChatRepository is responsible for managing data persistence in a robust way." | "Every change to a conversation goes through ChatRepository, inside a database transaction." |
| "This section explains how tools work. Tools are an important part of the system." | Section summary: "One answer can take many round trips: the model asks for a tool, the phone runs it, and the result goes back to the model." |
| Caption: "Sequence diagram of sending a message." | Caption: "Your message is stored before the model is called, so nothing is lost if the network fails." |
| Step: "First it parses the arguments, then it validates them, then it calls the executor." | Step: "Arguments are checked again before running, because the tool's contract may have changed since the model asked." |
| "The system uses various strategies to ensure reliability." | "Nothing is retried automatically: a failure is shown to you, so a click or a write never happens twice." |

## Final check

Before rendering, reread the document and confirm:

- Each section answers one question, and its first sentence works for a non-programmer.
- No paragraph restates a diagram, caption or another block.
- Every claim is something you verified in the code.
- Every term is defined once and named the same way everywhere.
- Summaries, steps and notes are within their budgets.
- None of the words and patterns to avoid appear.
