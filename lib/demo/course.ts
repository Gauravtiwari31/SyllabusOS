// Static data for the seeded DBMS demo goal: units + concepts, three years of previous-year
// questions (their marks drive weightage), and the pages of the student's notes PDF that
// the tutor cites. Pure data + tiny pure helpers; no DB access here.
import { CONCEPT_NAMES as C } from "./bank";

export const DEMO_FILES = {
  syllabus: "DBMS_Syllabus.pdf",
  notes: "DBMS_Notes.pdf",
  pyq: "DBMS_PYQs_2022-2024.pdf",
} as const;

export const DEMO_UNITS = {
  u1: "Unit 1 · Foundations & ER Model",
  u2: "Unit 2 · Relational Model & SQL",
  u3: "Unit 3 · Normalization",
  u4: "Unit 4 · Transactions & Concurrency",
  u5: "Unit 5 · Recovery & Indexing",
} as const;

export interface DemoConcept {
  name: string;
  unit: string;
  description: string;
  /** minutes to learn from scratch */
  estMinutes: number;
}

/** Syllabus order (drives Concept.order). Names are the bank's canonical names. */
export const DEMO_CONCEPTS: DemoConcept[] = [
  {
    name: C.architecture,
    unit: DEMO_UNITS.u1,
    description: "Three-schema architecture (external, conceptual, internal) and logical vs physical data independence.",
    estMinutes: 25,
  },
  {
    name: C.er,
    unit: DEMO_UNITS.u1,
    description: "Entity sets, attributes, relationship sets, cardinality ratios, participation constraints and weak entities.",
    estMinutes: 35,
  },
  {
    name: C.erMapping,
    unit: DEMO_UNITS.u1,
    description: "Reducing an ER diagram to tables: entities, weak entities, 1:N and M:N relationships, multivalued attributes.",
    estMinutes: 30,
  },
  {
    name: C.relational,
    unit: DEMO_UNITS.u2,
    description: "Relations, tuples, domains; schema vs instance; entity and referential integrity constraints.",
    estMinutes: 25,
  },
  {
    name: C.keys,
    unit: DEMO_UNITS.u2,
    description: "Super, candidate, primary, alternate and foreign keys; counting super keys.",
    estMinutes: 30,
  },
  {
    name: C.algebra,
    unit: DEMO_UNITS.u2,
    description: "Selection, projection, set operations, Cartesian product, joins and division as query expressions.",
    estMinutes: 40,
  },
  {
    name: C.sql,
    unit: DEMO_UNITS.u2,
    description: "DDL and DML, SELECT–FROM–WHERE, aggregate functions, GROUP BY and HAVING, NULL handling.",
    estMinutes: 40,
  },
  {
    name: C.joins,
    unit: DEMO_UNITS.u2,
    description: "Inner, natural and outer joins; nested and correlated subqueries with IN and EXISTS.",
    estMinutes: 35,
  },
  {
    name: C.fd,
    unit: DEMO_UNITS.u3,
    description: "Meaning of X → Y, trivial dependencies and Armstrong's axioms.",
    estMinutes: 30,
  },
  {
    name: C.closure,
    unit: DEMO_UNITS.u3,
    description: "Computing X⁺ under a set of FDs and using it to find all candidate keys.",
    estMinutes: 35,
  },
  {
    name: C.normalForms,
    unit: DEMO_UNITS.u3,
    description: "Update anomalies; 1NF, 2NF (no partial dependency) and 3NF (no transitive dependency).",
    estMinutes: 45,
  },
  {
    name: C.bcnf,
    unit: DEMO_UNITS.u3,
    description: "Every determinant a super key; 3NF vs BCNF and BCNF decomposition.",
    estMinutes: 35,
  },
  {
    name: C.lossless,
    unit: DEMO_UNITS.u3,
    description: "The R1 ∩ R2 → R1 or R2 test, and why lossy decompositions create spurious tuples.",
    estMinutes: 30,
  },
  {
    name: C.depPreservation,
    unit: DEMO_UNITS.u3,
    description: "Checking (F1 ∪ … ∪ Fn)⁺ = F⁺; the 3NF synthesis vs BCNF trade-off.",
    estMinutes: 25,
  },
  {
    name: C.acid,
    unit: DEMO_UNITS.u4,
    description: "Atomicity, consistency, isolation and durability; transaction states.",
    estMinutes: 25,
  },
  {
    name: C.schedules,
    unit: DEMO_UNITS.u4,
    description: "Serial vs concurrent schedules; lost update and dirty read problems.",
    estMinutes: 25,
  },
  {
    name: C.conflict,
    unit: DEMO_UNITS.u4,
    description: "Conflicting operations, conflict equivalence and the precedence-graph test.",
    estMinutes: 45,
  },
  {
    name: C.view,
    unit: DEMO_UNITS.u4,
    description: "View equivalence, blind writes, and view- but not conflict-serializable schedules.",
    estMinutes: 35,
  },
  {
    name: C.recoverability,
    unit: DEMO_UNITS.u4,
    description: "Recoverable, cascadeless and strict schedules; cascading rollback.",
    estMinutes: 35,
  },
  {
    name: C.twoPL,
    unit: DEMO_UNITS.u4,
    description: "Shared/exclusive locks, growing and shrinking phases, strict 2PL.",
    estMinutes: 35,
  },
  {
    name: C.deadlocks,
    unit: DEMO_UNITS.u4,
    description: "Wait-for graphs, detection and victim selection, wait-die and wound-wait prevention.",
    estMinutes: 30,
  },
  {
    name: C.timestamp,
    unit: DEMO_UNITS.u4,
    description: "Read/write timestamps, when a transaction is rolled back, Thomas' write rule.",
    estMinutes: 30,
  },
  {
    name: C.logRecovery,
    unit: DEMO_UNITS.u5,
    description: "Write-ahead logging, deferred vs immediate modification, undo and redo after a crash.",
    estMinutes: 35,
  },
  {
    name: C.checkpoints,
    unit: DEMO_UNITS.u5,
    description: "What a checkpoint flushes, and which transactions recovery ignores, redoes or undoes.",
    estMinutes: 20,
  },
  {
    name: C.indexing,
    unit: DEMO_UNITS.u5,
    description: "Primary vs secondary and dense vs sparse indices; counting index blocks.",
    estMinutes: 30,
  },
  {
    name: C.bplus,
    unit: DEMO_UNITS.u5,
    description: "Leaf-linked balanced trees: fan-out, height, search, insertion and node splits.",
    estMinutes: 45,
  },
  {
    name: C.hashing,
    unit: DEMO_UNITS.u5,
    description: "Static hashing and overflow chains; extendible hashing with global and local depth.",
    estMinutes: 30,
  },
];

export interface DemoPyq {
  concept: string;
  year: number;
  marks: number;
  text: string;
}

/** Three end-semester papers (2022–2024), each question mapped to one concept. */
export const DEMO_PYQS: DemoPyq[] = [
  // 2022
  {
    concept: C.conflict,
    year: 2022,
    marks: 12,
    text: "Define conflict serializability. Using a precedence graph, test whether S: r1(X), r2(X), w1(X), r3(X), w2(X) is conflict serializable. If it is, give an equivalent serial schedule.",
  },
  {
    concept: C.normalForms,
    year: 2022,
    marks: 12,
    text: "What is normalization? Explain 1NF, 2NF and 3NF with examples, and normalize R(A, B, C, D, E) with FDs {AB → C, B → D, D → E} up to 3NF.",
  },
  {
    concept: C.bcnf,
    year: 2022,
    marks: 10,
    text: "Why is BCNF stricter than 3NF? Give a relation that is in 3NF but not in BCNF and decompose it into BCNF.",
  },
  {
    concept: C.sql,
    year: 2022,
    marks: 10,
    text: "For Employee(eid, name, dept, salary) write SQL to: (i) find the department-wise average salary; (ii) list departments with more than 5 employees; (iii) find employees earning more than their department's average.",
  },
  {
    concept: C.recoverability,
    year: 2022,
    marks: 6,
    text: "Define recoverable and cascadeless schedules. Give one example of each.",
  },
  {
    concept: C.deadlocks,
    year: 2022,
    marks: 6,
    text: "Explain the wait-die and wound-wait deadlock prevention schemes.",
  },
  {
    concept: C.hashing,
    year: 2022,
    marks: 6,
    text: "Explain extendible hashing with an example. How does it differ from static hashing?",
  },
  {
    concept: C.architecture,
    year: 2022,
    marks: 5,
    text: "Explain the three-schema architecture of a DBMS. What is data independence?",
  },
  {
    concept: C.fd,
    year: 2022,
    marks: 4,
    text: "Define functional dependency. When is a functional dependency trivial?",
  },
  // 2023
  {
    concept: C.conflict,
    year: 2023,
    marks: 12,
    text: "What is a precedence graph? Check whether S: r1(A), r2(B), w2(A), r3(A), w1(B), w3(B) is conflict serializable and justify your answer.",
  },
  {
    concept: C.twoPL,
    year: 2023,
    marks: 10,
    text: "Explain the two-phase locking protocol. Does it ensure serializability? Does it prevent deadlocks? Discuss strict 2PL.",
  },
  {
    concept: C.closure,
    year: 2023,
    marks: 10,
    text: "Given R(A, B, C, D, E) with F = {A → B, BC → E, ED → A}, compute (AC)⁺ and find all candidate keys of R.",
  },
  {
    concept: C.er,
    year: 2023,
    marks: 10,
    text: "Draw an ER diagram for a university with students, courses, instructors and departments, showing cardinality and participation constraints.",
  },
  {
    concept: C.bplus,
    year: 2023,
    marks: 10,
    text: "Construct a B+ tree of order 4 by inserting the keys 10, 20, 5, 6, 12, 30, 7, 17 in that order.",
  },
  {
    concept: C.timestamp,
    year: 2023,
    marks: 6,
    text: "Explain the timestamp-ordering protocol. What is Thomas' write rule?",
  },
  {
    concept: C.lossless,
    year: 2023,
    marks: 8,
    text: "When is a decomposition lossless? Check whether decomposing R(A, B, C, D) with F = {A → B, B → C} into R1(A, B) and R2(B, C, D) is lossless.",
  },
  {
    concept: C.acid,
    year: 2023,
    marks: 5,
    text: "Explain the ACID properties of a transaction using a fund-transfer example.",
  },
  {
    concept: C.checkpoints,
    year: 2023,
    marks: 4,
    text: "What is a checkpoint? How does it reduce recovery time?",
  },
  // 2024
  {
    concept: C.conflict,
    year: 2024,
    marks: 16,
    text: "Define conflict equivalence. Using a precedence graph, test S: r1(X), r2(Z), r1(Z), r3(X), r3(Y), w1(X), w3(Y), r2(Y), w2(Z), w2(Y) and give an equivalent serial schedule if one exists.",
  },
  {
    concept: C.normalForms,
    year: 2024,
    marks: 12,
    text: "Explain partial and transitive dependencies. Normalize Student_Course(roll_no, name, course_id, course_name, instructor, grade) up to 3NF, stating the FDs you assume.",
  },
  {
    concept: C.bplus,
    year: 2024,
    marks: 10,
    text: "Explain insertion and deletion in a B+ tree. Why are B+ trees preferred over binary search trees for disk-based indexing?",
  },
  {
    concept: C.recoverability,
    year: 2024,
    marks: 10,
    text: "What is cascading rollback? Explain how cascadeless and strict schedules avoid it, with examples.",
  },
  {
    concept: C.algebra,
    year: 2024,
    marks: 10,
    text: "Sailors(sid, sname, rating), Boats(bid, color), Reserves(sid, bid, day): write relational algebra for (i) names of sailors who reserved a red boat; (ii) sailors who reserved all boats.",
  },
  {
    concept: C.logRecovery,
    year: 2024,
    marks: 8,
    text: "Explain deferred and immediate database modification with log records. What is write-ahead logging?",
  },
  {
    concept: C.keys,
    year: 2024,
    marks: 4,
    text: "Differentiate between super key, candidate key and primary key with examples.",
  },
  {
    concept: C.view,
    year: 2024,
    marks: 6,
    text: "What is a blind write? Give a schedule that is view serializable but not conflict serializable.",
  },
  {
    concept: C.schedules,
    year: 2024,
    marks: 4,
    text: "Differentiate between serial and non-serial schedules.",
  },
];

/**
 * Marks-based weightage, the same rule the onboarding PYQ step applies: each concept's share
 * of all mapped marks (concepts no paper asked about get 0). Shares sum to 1.
 */
export function pyqWeightage(
  concepts: Array<{ name: string }>,
  pyqs: DemoPyq[],
): Map<string, { marks: number; share: number }> {
  const marks = new Map(concepts.map((c) => [c.name, 0]));
  for (const q of pyqs) if (marks.has(q.concept)) marks.set(q.concept, (marks.get(q.concept) ?? 0) + q.marks);
  const total = [...marks.values()].reduce((s, m) => s + m, 0);
  return new Map([...marks].map(([name, m]) => [name, { marks: m, share: total > 0 ? m / total : 0 }]));
}

export interface DemoNotePage {
  page: number;
  concept: string;
  text: string;
}

/** DBMS_Notes.pdf, one chunk per page, tagged with the concept the page covers. */
export const DEMO_NOTES: DemoNotePage[] = [
  {
    page: 1,
    concept: C.architecture,
    text: "Three-schema architecture. A DBMS describes data at three levels. The external level holds the user views: each application sees only the part of the database it needs. The conceptual level describes the whole database for the community of users — entities, relationships, constraints — without storage details. The internal level describes physical storage: files, record layout, indexes, access paths. The DBMS maps each level to the one below it. Data independence is the ability to change one level without changing the level above. Physical data independence: change the internal schema (add an index, reorganise a file) without touching the conceptual schema. Logical data independence: change the conceptual schema (add a column or table) without rewriting external views or applications. Logical independence is harder to achieve because programs depend on logical structure.",
  },
  {
    page: 2,
    concept: C.er,
    text: "ER model basics. An entity is a real-world object (a Student); an entity set is a collection of similar entities, drawn as a rectangle. Attributes are drawn as ellipses: simple or composite (Name → First, Last), single-valued or multivalued (PhoneNo, double ellipse), stored or derived (Age from DateOfBirth, dashed ellipse). A key attribute is underlined. A relationship associates entities (Student Enrolls Course) and is drawn as a diamond; a relationship set can have its own attributes, such as grade on Enrolls, when the attribute describes the pair rather than either entity.",
  },
  {
    page: 3,
    concept: C.er,
    text: "Mapping cardinalities and participation. For a binary relationship the cardinality ratio is 1:1, 1:N, N:1 or M:N — ask 'how many?' from both sides. Example: Doctor Treats Patient is M:N; Department has Employees is 1:N. Participation is total (double line) when every entity must take part, partial otherwise. A weak entity set (double rectangle) has no key of its own, only a partial key (discriminator, dashed underline); it is identified through an identifying relationship (double diamond) with its owner entity set, e.g. Dependent owned by Employee. A weak entity always has total participation in its identifying relationship.",
  },
  {
    page: 4,
    concept: C.erMapping,
    text: "Reducing ER diagrams to tables. 1) Each strong entity set becomes a table with its simple attributes; composite attributes are flattened. 2) A weak entity set becomes a table whose primary key is the owner's key plus the partial key. 3) 1:N relationship: put the key of the '1' side as a foreign key in the 'N' side's table — no new table. 4) 1:1: foreign key on either side, preferably the side with total participation. 5) M:N relationship: a separate table holding both keys as foreign keys plus the relationship's attributes; its primary key is the combination of both keys. 6) A multivalued attribute becomes its own table (owner key, value). Example: Student, Course, Enrolls(M:N) and Student.PhoneNo(multivalued) need 4 tables.",
  },
  {
    page: 5,
    concept: C.relational,
    text: "Relational model. A relation schema R(A1, …, An) lists attributes, each with a domain of atomic values. A relation (instance) is a set of tuples: tuple order does not matter, attribute order does not matter, and duplicate tuples are not allowed. Degree = number of attributes; cardinality = number of tuples. Integrity constraints: domain constraints (values come from the domain), key constraints (no two tuples share a key value), entity integrity (primary-key attributes are never NULL) and referential integrity (every non-NULL foreign-key value must appear as a primary-key value in the referenced relation). Deleting a referenced row can violate referential integrity; the DBMS may reject it, cascade the delete, or set the foreign key to NULL.",
  },
  {
    page: 6,
    concept: C.keys,
    text: "Keys. A super key is any set of attributes that uniquely identifies a tuple. A candidate key is a minimal super key: no proper subset of it is a super key. A relation may have several candidate keys; the designer picks one as the primary key and the rest are alternate keys. A foreign key is a set of attributes in one relation that refers to the primary key of another; its values need not be unique. Counting super keys: in R(A, B, C, D) with the single candidate key A, every superset of {A} is a super key, giving 2^3 = 8. With candidate keys A and B, use inclusion–exclusion: 8 + 8 − 4 = 12.",
  },
  {
    page: 7,
    concept: C.algebra,
    text: "Relational algebra operators. Selection σ_condition(R) keeps the tuples that satisfy the condition (a horizontal subset). Projection π_attributes(R) keeps the listed attributes (a vertical subset) and removes duplicate tuples, because the result is a set. Union, intersection and set difference need union-compatible relations (same degree and matching domains). Cartesian product R × S pairs every tuple of R with every tuple of S: degree adds, cardinality multiplies. Rename ρ gives a relation or its attributes new names. Example: names of CSE employees = π_name(σ_dept='CSE'(Employee)); selection must come first, because after π_name the dept attribute is gone.",
  },
  {
    page: 8,
    concept: C.algebra,
    text: "Joins and division. Theta join R ⋈_θ S = σ_θ(R × S). Natural join ⋈ equates all common attributes and keeps one copy of each. Division R ÷ S answers 'for all' queries: with Enrolled(student, course) and Course(course), Enrolled ÷ Course returns the students enrolled in every course. Division can be written with basic operators: π_student(Enrolled) − π_student((π_student(Enrolled) × Course) − Enrolled). Query writing tip: read the English, pick relations, join them, select, then project last.",
  },
  {
    page: 9,
    concept: C.sql,
    text: "SQL basics. DDL defines structure: CREATE, ALTER, DROP, TRUNCATE. DML works on data: SELECT, INSERT, UPDATE, DELETE. DCL controls access: GRANT, REVOKE. A query is evaluated logically as FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY. WHERE filters rows before grouping; HAVING filters groups using aggregate conditions. Aggregate functions COUNT, SUM, AVG, MIN and MAX ignore NULLs, except COUNT(*), which counts rows. Example: SELECT dept, AVG(salary) FROM Employee GROUP BY dept HAVING AVG(salary) > 50000; Only grouped columns and aggregates may appear in the SELECT list of a grouped query.",
  },
  {
    page: 10,
    concept: C.joins,
    text: "Joins and nested queries. INNER JOIN returns only matching pairs. LEFT OUTER JOIN keeps every row of the left table, filling the right side's columns with NULL when there is no match; RIGHT OUTER JOIN does the same for the right table; FULL OUTER JOIN keeps unmatched rows from both. A subquery can appear in WHERE with IN, EXISTS, ANY or ALL. A correlated subquery refers to a column of the outer query, so it is logically re-evaluated for each outer row: SELECT name FROM Employee e WHERE salary > (SELECT AVG(salary) FROM Employee WHERE dept = e.dept); EXISTS returns true when the subquery returns at least one row.",
  },
  {
    page: 11,
    concept: C.fd,
    text: "Functional dependencies. X → Y holds on R if any two tuples that agree on X also agree on Y: X determines Y. An FD is a statement about every legal instance, so it cannot be proved from sample rows, though a single instance can disprove it. X → Y is trivial if Y ⊆ X, e.g. {StudentID, CourseID} → StudentID. Armstrong's axioms are sound and complete: reflexivity (if Y ⊆ X then X → Y), augmentation (if X → Y then XZ → YZ), transitivity (if X → Y and Y → Z then X → Z). Derived rules: union, decomposition, pseudotransitivity. F⁺ is the set of all FDs implied by F.",
  },
  {
    page: 12,
    concept: C.closure,
    text: "Attribute closure X⁺. Algorithm: result = X; repeat — for each FD Y → Z in F, if Y ⊆ result then add Z to result — until nothing changes. An FD fires only when its whole left side is in the result. Uses: X is a super key iff X⁺ contains all attributes of R; X → Y is implied by F iff Y ⊆ X⁺. Finding candidate keys: attributes that appear on no right-hand side must be in every key; start from them and add attributes until the closure is R, keeping only minimal sets. Example: R(A, B, C, D, E), F = {A → B, B → C, CD → E}: A⁺ = {A, B, C}, so A is not a key; A and D appear on no right side and (AD)⁺ = R, so AD is the only candidate key.",
  },
  {
    page: 13,
    concept: C.normalForms,
    text: "Anomalies, 1NF and 2NF. Redundant storage causes insertion anomalies (a new course can't be stored until a student enrols), deletion anomalies (deleting the last enrolment loses the course) and update anomalies (a course name changed in one row but not another). 1NF: all attribute values are atomic. A prime attribute belongs to some candidate key; the others are non-prime. A partial dependency is X → A where X is a proper subset of a candidate key and A is non-prime. 2NF = 1NF with no partial dependencies. Example: R(StudentID, CourseID, StudentName, Grade) with key {StudentID, CourseID} and StudentID → StudentName is not in 2NF; decompose into Student(StudentID, StudentName) and Enrollment(StudentID, CourseID, Grade).",
  },
  {
    page: 14,
    concept: C.normalForms,
    text: "Third normal form. A transitive dependency is X → Y → A where Y is not a super key and A is non-prime, e.g. RollNo → DeptID → DeptName. 3NF: for every non-trivial FD X → A, either X is a super key or A is a prime attribute. Example: R(A, B, C) with key A and FDs A → B, B → C is in 2NF (single-attribute key, so no partial dependency) but not 3NF, because B → C is transitive; decompose into R1(A, B) and R2(B, C). The 3NF synthesis algorithm (one relation per FD of a canonical cover, plus a key if needed) is always lossless and dependency preserving.",
  },
  {
    page: 15,
    concept: C.bcnf,
    text: "Boyce–Codd normal form. R is in BCNF if for every non-trivial FD X → Y, X is a super key — with no exception for prime attributes, so BCNF is stricter than 3NF. Every BCNF relation is in 3NF, and every two-attribute relation is in BCNF. Classic 3NF-but-not-BCNF case: R(Student, Course, Instructor) with {Student, Course} → Instructor and Instructor → Course. Candidate keys are {Student, Course} and {Student, Instructor}, so Course is prime and 3NF holds, but Instructor is not a super key. BCNF decomposition: pick a violating X → Y, split into (X ∪ Y) and (R − Y), repeat. The result is always lossless but may not preserve dependencies.",
  },
  {
    page: 16,
    concept: C.lossless,
    text: "Lossless-join decomposition. Decomposing R into R1 and R2 is lossless if R1 ⋈ R2 = R for every legal instance. Test for a binary decomposition: the common attributes R1 ∩ R2 must functionally determine R1 or R2, i.e. (R1 ∩ R2)⁺ ⊇ R1 or ⊇ R2. A lossy decomposition does not lose tuples — the join produces extra, spurious tuples, so the original facts can no longer be told apart. Example: R(A, B, C) with A → B split into R1(A, B), R2(A, C) is lossless because A → AB. Splitting into two relations with no common attribute is always lossy, since the join is a Cartesian product.",
  },
  {
    page: 17,
    concept: C.depPreservation,
    text: "Dependency preservation. Let Fi be the projection of F⁺ onto Ri (all implied FDs that use only Ri's attributes). The decomposition is dependency preserving if (F1 ∪ … ∪ Fn)⁺ = F⁺, so every FD can be checked inside a single table without joins. Implied FDs count: A → C holds on R2(A, C) when A → B and B → C. Example: R(A, B, C), F = {A → B, B → C} decomposed into R1(A, B), R2(A, C) is lossless but loses B → C; decomposing into R1(A, B), R2(B, C) is both lossless and dependency preserving. 3NF synthesis always preserves dependencies; BCNF decomposition sometimes cannot.",
  },
  {
    page: 18,
    concept: C.acid,
    text: "Transactions and ACID. A transaction is a unit of work that must be atomic: all of its operations happen or none do. Atomicity is ensured by the recovery manager using the log to undo incomplete transactions. Consistency: a correct transaction takes the database from one consistent state to another (for a transfer, A + B is unchanged). Isolation: concurrent transactions behave as if executed serially, ensured by concurrency control. Durability: once committed, changes survive failures, ensured by the log and recovery. Transaction states: active → partially committed (after the final statement) → committed, or active → failed → aborted (rolled back, then restarted or killed).",
  },
  {
    page: 19,
    concept: C.schedules,
    text: "Schedules. A schedule is the order in which the operations of concurrent transactions execute; each transaction's own operations stay in order. In a serial schedule transactions run one after another — n transactions have n! serial schedules. A non-serial (concurrent) schedule interleaves operations for better throughput and response time, but can cause anomalies. Lost update: r1(X) r2(X) w1(X) w2(X) — T2 writes from a stale read and T1's update disappears (X = 100, +50 by T1, −30 by T2 gives 70 instead of 120). Dirty read: T2 reads a value written by an uncommitted T1 that later aborts. Unrepeatable read: T1 reads X twice and gets different values.",
  },
  {
    page: 20,
    concept: C.conflict,
    text: "Conflict serializability. Two operations conflict if they belong to different transactions, access the same data item, and at least one of them is a write: read–write, write–read and write–write pairs conflict, but two reads never do. Swapping adjacent non-conflicting operations does not change the result. Two schedules are conflict equivalent if one can be turned into the other by such swaps — equivalently, every pair of conflicting operations appears in the same order in both. A schedule is conflict serializable if it is conflict equivalent to some serial schedule.",
  },
  {
    page: 21,
    concept: C.conflict,
    text: "Precedence graph test. Draw one node per transaction. For each pair of conflicting operations where Ti's operation comes before Tj's, add an edge Ti → Tj. The schedule is conflict serializable if and only if the graph is acyclic; any topological order of the graph is an equivalent serial schedule. Example: S = r1(X) r2(X) w1(X) w2(X). r1(X) before w2(X) gives T1 → T2; r2(X) before w1(X) gives T2 → T1; w1(X) before w2(X) gives T1 → T2. The cycle T1 → T2 → T1 means S is not conflict serializable. Common error: adding an edge for r1(X), r2(X) — two reads never conflict.",
  },
  {
    page: 22,
    concept: C.view,
    text: "View serializability. S and S' are view equivalent if, for every data item: the same transaction reads the initial value; each read reads the value produced by the same write in both; and the same transaction performs the final write. S is view serializable if it is view equivalent to a serial schedule. Every conflict-serializable schedule is view serializable, but not conversely: r1(X) w2(X) w1(X) w3(X) has a cycle in its precedence graph yet is view equivalent to T1 T2 T3. Such schedules always contain blind writes (a write of an item the transaction never read). Testing view serializability is NP-complete, so practical protocols target conflict serializability.",
  },
  {
    page: 23,
    concept: C.recoverability,
    text: "Recoverability. Tj reads from Ti if Tj reads a value Ti wrote. A schedule is recoverable if, whenever Tj reads from Ti, Ti commits before Tj commits. w1(X) r2(X) c2 c1 is not recoverable: if T1 aborts, the already committed T2 cannot be undone. Cascading rollback: one abort forces other transactions that read its data to abort too. A cascadeless schedule allows reads only of committed values, so aborts never cascade. A strict schedule allows neither reads nor writes of X until the last transaction that wrote X has committed or aborted. Strict ⊂ cascadeless ⊂ recoverable. Example: w1(X) r2(X) c1 c2 is recoverable but not cascadeless.",
  },
  {
    page: 24,
    concept: C.twoPL,
    text: "Two-phase locking. Shared (S) locks allow reading; exclusive (X) locks allow reading and writing. Only S–S is compatible. Under 2PL each transaction has a growing phase, in which it acquires locks and releases none, followed by a shrinking phase, in which it releases locks and acquires none. The point where it holds its last new lock is its lock point; ordering transactions by lock point gives an equivalent serial schedule, so 2PL guarantees conflict serializability. 2PL does not prevent deadlocks, and basic 2PL allows cascading rollbacks. Strict 2PL holds exclusive locks until commit or abort (cascadeless); rigorous 2PL holds all locks until then.",
  },
  {
    page: 25,
    concept: C.deadlocks,
    text: "Deadlocks. A deadlock is a set of transactions each waiting for a lock held by another in the set. Detection: build a wait-for graph with an edge Ti → Tj when Ti waits for Tj; there is a deadlock iff the graph has a cycle. Recovery: choose a victim (youngest, least work done, fewest locks) and roll it back; avoid starvation by counting how often a transaction is chosen. Prevention with timestamps (older = smaller timestamp): wait-die — an older requester waits, a younger requester dies; wound-wait — an older requester wounds (aborts) the younger holder, a younger requester waits. A restarted transaction keeps its original timestamp.",
  },
  {
    page: 26,
    concept: C.timestamp,
    text: "Timestamp ordering. Each transaction gets a timestamp TS(T) when it starts; the protocol makes the schedule equivalent to the serial order of timestamps. Each item X keeps R-TS(X) and W-TS(X), the largest timestamps that read and wrote it. Read(X) by T: if TS(T) < W-TS(X), T would read an overwritten value — roll T back; otherwise read and set R-TS(X) = max(R-TS(X), TS(T)). Write(X) by T: if TS(T) < R-TS(X) or TS(T) < W-TS(X), roll T back; otherwise write and set W-TS(X) = TS(T). Thomas' write rule: if TS(T) < W-TS(X) but TS(T) ≥ R-TS(X), ignore the obsolete write instead of rolling back. No transaction waits, so the protocol is deadlock free, but it can cause cascading rollbacks unless reads wait for commits.",
  },
  {
    page: 27,
    concept: C.logRecovery,
    text: "Log-based recovery. The log is a sequence of records on stable storage: <T start>, <T, X, old value, new value>, <T commit>, <T abort>. Write-ahead logging: a log record must reach stable storage before the data item it describes is written to disk, and all of a transaction's log records must be written before its commit. Immediate modification: updates may reach the database before commit, so recovery must undo transactions without <commit> (restore old values, scanning backwards) and redo transactions with <commit> (reapply new values). Deferred modification: nothing is written to the database until commit, so recovery only redoes and log records need only the new value.",
  },
  {
    page: 28,
    concept: C.checkpoints,
    text: "Checkpoints. Without checkpoints recovery must scan the whole log and redo transactions whose changes are already on disk. At a checkpoint the system writes all log records in memory to stable storage, writes all modified buffer blocks to disk, and writes a <checkpoint L> record, where L lists the active transactions. After a crash, recovery scans back to the last checkpoint: transactions that committed before it are ignored; those that committed after it are redone; those in L or started later without a commit record are undone. Fuzzy checkpoints let transactions continue while modified blocks are flushed.",
  },
  {
    page: 29,
    concept: C.indexing,
    text: "Ordered indices. A primary (clustering) index is built on the attribute the file is sorted by; a secondary index is on any other attribute. A dense index has an entry for every search-key value. A sparse index has entries for only some values, typically one per data block; to find a key, locate the largest entry ≤ the key and scan that block, which works only when the file is sorted on the search key. So a secondary index must be dense. Sizing example: 30,000 records, 10 per block, gives 3,000 blocks; a sparse index needs 3,000 entries, i.e. 30 blocks at 100 entries per block, and a dense index needs 300. A multilevel index builds a sparse index on the index itself.",
  },
  {
    page: 30,
    concept: C.bplus,
    text: "B+ tree structure. A B+ tree is a balanced multilevel index: every path from root to leaf has the same length. Internal nodes contain only separator keys and child pointers; with fan-out n, a node holds up to n pointers and n − 1 keys, and every node except the root is at least half full. All search keys appear in the leaves together with pointers to the records, and each leaf points to the next leaf, so a range query finds its first key and then follows the leaf chain. Unlike a B-tree, a B+ tree never stores record pointers in internal nodes, which keeps them small and the fan-out high.",
  },
  {
    page: 31,
    concept: C.bplus,
    text: "B+ tree operations and height. Search: follow separators from the root to a leaf. Insertion: insert into the leaf; if it overflows, split it into two half-full leaves and copy the smallest key of the right leaf up into the parent; splits may propagate up, and a root split adds a level — the tree grows only at the root. Deletion may merge or redistribute nodes. Fan-out from block size: with 4096-byte blocks, 10-byte keys and 6-byte pointers, 6n + 10(n − 1) ≤ 4096 gives n = 256. Height: with fan-out 100 and 100 keys per leaf, three levels index 100 × 100 × 100 = 1,000,000 keys, so a lookup costs about 3 block reads.",
  },
  {
    page: 32,
    concept: C.hashing,
    text: "Hashing. A hash function h maps a search key to a bucket (one or more disk blocks). Equality search reads one bucket, but hashing keeps no key order, so range queries must scan every bucket — use a B+ tree for ranges. Static hashing fixes the number of buckets; as the file grows, overflow chains get longer and performance degrades. Example: h(k) = k mod 7 puts key 45 in bucket 3. Extendible hashing uses a directory of 2^d pointers, where d is the global depth; each bucket has a local depth. When a bucket overflows: if its local depth < global depth, split only that bucket; if they are equal, double the directory first (global depth + 1).",
  },
];
