// Offline content bank: DBMS questions + Socratic tutor scripts. Used when no Gemini key
// is configured, and to seed the demo goal. Every answer key was worked by hand; the bank
// test (bank.test.ts) re-checks the structure (4 distinct options, valid keys, no cycles).
//
// Course: "Database Management Systems", 5 units, 27 concepts, as taught in a typical
// Indian B.Tech 5th-semester syllabus (AKTU / Anna University / RGPV phrasings in aliases).

export interface BankQuestion {
  /** Canonical concept name (must match a demo concept name). */
  concept: string;
  type: "mcq" | "numeric";
  body: string;
  /** exactly 4 for mcq, null for numeric */
  options: string[] | null;
  /** mcq: "0".."3"; numeric: number as string */
  answer: string;
  explanation: string;
  /** logits, -2 … 2 */
  difficulty: number;
  purposes: Array<"diagnostic" | "practice" | "check">;
}

export interface TutorScript {
  /** Canonical concept name */
  concept: string;
  /** Other names that should match this script (case-insensitive) */
  aliases: string[];
  /** Keywords / short phrases a correct answer should contain (offline grading) */
  keyIdeas: string[];
  probe: string;
  hint1: string;
  hint2: string;
  workedStep: string;
  /** Asked at the end to confirm understanding (free text) */
  checkPrompt: string;
  misconceptions: Array<{
    /** any of these keywords in a wrong answer triggers this misconception */
    triggers: string[];
    label: string;
    nudge: string;
  }>;
}

// ── Canonical names (one place, so scripts, questions and prerequisites can't drift) ──

export const CONCEPT_NAMES = {
  architecture: "DBMS Architecture",
  er: "ER Model",
  erMapping: "ER to Relational Mapping",
  relational: "Relational Model",
  keys: "Keys",
  algebra: "Relational Algebra",
  sql: "SQL Queries",
  joins: "Joins & Nested Queries",
  fd: "Functional Dependencies",
  closure: "Attribute Closure",
  normalForms: "Normal Forms (1NF–3NF)",
  bcnf: "BCNF",
  lossless: "Lossless-Join Decomposition",
  depPreservation: "Dependency Preservation",
  acid: "ACID Properties",
  schedules: "Schedules",
  conflict: "Conflict Serializability",
  view: "View Serializability",
  recoverability: "Recoverability",
  twoPL: "Two-Phase Locking",
  deadlocks: "Deadlocks",
  timestamp: "Timestamp Ordering",
  logRecovery: "Log-Based Recovery",
  checkpoints: "Checkpoints",
  indexing: "Indexing Basics",
  bplus: "B+ Trees",
  hashing: "Hashing",
} as const;

const C = CONCEPT_NAMES;

// ── Tutor scripts ───────────────────────────────────────────────────────────
// Ordered by unit. Where two scripts could both match a short syllabus phrase on token
// overlap alone (e.g. "Recovery …" vs "Recoverability"), explicit aliases decide.

export const TUTOR_SCRIPTS: TutorScript[] = [
  // Unit 1 · Foundations & ER Model
  {
    concept: C.architecture,
    aliases: [
      "Database Architecture",
      "Database System Architecture",
      "Database System Concept and Architecture",
      "Database System Concepts and Architecture",
      "Three Schema Architecture",
      "Three-Schema Architecture",
      "Three-Level Architecture",
      "ANSI/SPARC Architecture",
      "Data Independence",
      "Logical Data Independence",
      "Physical Data Independence",
      "Views of Data",
      "Levels of Abstraction",
      "Schemas and Instances",
      "Data Model Schema and Instances",
      "Data Models",
      "DBMS Structure",
      "Overall Database Structure",
      "Database System Structure",
      "Introduction to DBMS",
      "Database System vs File System",
      "DBMS vs File System",
      "Purpose of Database System",
    ],
    keyIdeas: [
      "external level",
      "conceptual level",
      "internal level",
      "user views",
      "physical storage",
      "mapping between levels",
      "logical data independence",
      "physical data independence",
    ],
    probe:
      "Your notes describe a DBMS in three levels. Name them and say, for each one, what it describes and who sees it.",
    hint1:
      "Think of three audiences: individual users and applications (their own views), the organisation as a whole (all entities, relationships and constraints), and the storage engine (files, records, indexes).",
    hint2:
      "The levels are external, conceptual and internal. Now suppose the DBA adds an index or changes the file organisation: which level changes, and which levels should NOT have to change?",
    workedStep:
      "External level = user views; conceptual level = the logical schema of the whole database (tables, relationships, constraints); internal level = physical storage (files, indexes, record layout). The DBMS maps between adjacent levels. Physical data independence: the internal schema can change (e.g. a new index) without changing the conceptual schema. Logical data independence: the conceptual schema can change (e.g. a new column) without rewriting external views or applications — it is harder to achieve.",
    checkPrompt:
      "A DBA adds a new column to a table and every existing application view keeps working unchanged. Which kind of data independence is that, and why?",
    misconceptions: [
      {
        triggers: ["physical data independence", "physical independence"],
        label: "Mixes up logical and physical data independence",
        nudge:
          "Which schema actually changed here — the one describing tables and columns, or the one describing files and indexes?",
      },
      {
        triggers: ["conceptual level is physical", "conceptual level stores", "conceptual is storage", "conceptual level is the storage"],
        label: "Confuses the conceptual level with physical storage",
        nudge:
          "Does the conceptual schema mention files, blocks or indexes at all? Which level is the only one that does?",
      },
      {
        triggers: ["two levels", "2 levels", "only schema and data"],
        label: "Remembers only two levels of abstraction",
        nudge: "Between individual user views and raw storage there is one more description. What does the whole organisation's schema sit in?",
      },
    ],
  },
  {
    concept: C.er,
    aliases: [
      "Entity Relationship Model",
      "Entity-Relationship Model",
      "E-R Model",
      "ER Diagram",
      "ER Diagrams",
      "E-R Diagram",
      "E-R Diagrams",
      "Entity Relationship Diagram",
      "ER Model Concepts",
      "Notation for ER Diagram",
      "Data Modeling Using the Entity Relationship Model",
      "Entity Sets",
      "Entity Sets and Relationship Sets",
      "Relationship Sets",
      "Mapping Cardinalities",
      "Mapping Constraints",
      "Cardinality Ratio",
      "Participation Constraints",
      "Weak Entity Sets",
      "Weak Entity",
      "Extended ER Model",
      "Enhanced ER Model",
      "Enhanced-ER Model",
      "EER Model",
    ],
    keyIdeas: [
      "entity set",
      "relationship set",
      "attribute",
      "cardinality",
      "many-to-many",
      "total participation",
      "weak entity",
      "identifying relationship",
      "partial key",
    ],
    probe:
      "Model a hospital where a Doctor treats Patients: a doctor treats many patients and a patient can be treated by many doctors. What does the ER diagram look like, and what is the cardinality ratio?",
    hint1:
      "Identify the entity sets first (rectangles), then the relationship between them (diamond). For the ratio, ask from both sides: how many patients per doctor, how many doctors per patient?",
    hint2:
      "Both answers are 'many', so the ratio is M:N. Now think about participation: must every patient be treated by at least one doctor? If so, that side is drawn with a double line.",
    workedStep:
      "Doctor and Patient are entity sets; Treats is a relationship set between them with cardinality M:N, because each side relates to many on the other. If every patient must be treated by some doctor, Patient has total participation (double line). Attributes of the treatment itself — date, diagnosis — belong on Treats, because they describe one doctor–patient pair, not either entity alone.",
    checkPrompt: "What makes an entity set 'weak', and what does it need in order to be identified?",
    misconceptions: [
      {
        triggers: ["one to many", "one-to-many", "1:n", "1:m"],
        label: "Reads a many-to-many relationship as one-to-many",
        nudge: "Ask the question from the patient's side too: can one patient be treated by more than one doctor?",
      },
      {
        triggers: ["double line means many", "total participation means many", "cardinality means mandatory", "participation is the ratio"],
        label: "Confuses cardinality ratio with participation",
        nudge: "Cardinality answers 'how many?'; participation answers 'must every entity take part?'. Which one does a double line show?",
      },
      {
        triggers: ["weak entity has a primary key", "own primary key", "weak entity has its own key"],
        label: "Thinks a weak entity has its own primary key",
        nudge: "If a Dependent could be identified by its own attributes, why would it need an owner entity at all?",
      },
    ],
  },
  {
    concept: C.erMapping,
    aliases: [
      "ER-to-Relational Mapping",
      "ER to Relational Model Mapping",
      "Mapping ER Model to Relational Model",
      "Reduction of ER Diagram to Tables",
      "Reduction of an ER Diagram to Tables",
      "Reduction of ER Diagrams to Tables",
      "Reduction of an ER Diagrams to Tables",
      "Reduction to Relational Schemas",
      "ER Diagram to Tables",
      "Converting ER Diagram to Tables",
      "ER to Table Conversion",
      "Relational Database Design Using ER-to-Relational Mapping",
    ],
    keyIdeas: [
      "table for each entity",
      "foreign key",
      "many side",
      "separate table",
      "m:n relationship",
      "composite primary key",
      "owner key",
      "multivalued attribute",
    ],
    probe:
      "Student and Course are linked by an M:N relationship Enrolls, which has an attribute grade. How many tables do you need, and what is the primary key of the Enrolls table?",
    hint1:
      "Each strong entity set gets its own table. For an M:N relationship, could you store it as a single foreign key on either side without repeating rows?",
    hint2:
      "No — an M:N relationship needs its own table holding the primary keys of both entities as foreign keys, plus its own attributes. Which combination of columns identifies one enrolment?",
    workedStep:
      "Student(roll_no, …) and Course(course_id, …) become two tables. Enrolls becomes a third table Enrolls(roll_no, course_id, grade) with both columns as foreign keys; its primary key is {roll_no, course_id}. That is 3 tables. A 1:N relationship needs no table of its own: put the key of the '1' side as a foreign key in the 'N' side's table.",
    checkPrompt:
      "For a 1:N relationship between Department (1) and Employee (N), where does the foreign key go, and why is no separate table needed?",
    misconceptions: [
      {
        triggers: ["foreign key in department", "department stores employee", "on the one side", "emp_id in department"],
        label: "Puts the foreign key on the 'one' side of a 1:N relationship",
        nudge: "If Department stored an emp_id column, how would you record a department with 40 employees in one row?",
      },
      {
        triggers: ["two tables", "2 tables", "foreign key in student", "foreign key in course"],
        label: "Maps an M:N relationship with a single foreign key",
        nudge: "Try storing course_id inside Student: what happens to a student who takes six courses?",
      },
      {
        triggers: ["partial key alone", "dep_name alone", "without the owner key", "weak entity own key"],
        label: "Keys a weak entity table by its partial key alone",
        nudge: "Two employees can each have a dependent called 'Asha'. What must you add so the key is unique?",
      },
    ],
  },

  // Unit 2 · Relational Model & SQL
  {
    concept: C.relational,
    aliases: [
      "Relational Data Model",
      "Relational Data Model Concepts",
      "Relational Model Concepts",
      "Structure of Relational Databases",
      "Introduction to Relational Databases",
      "Relational Databases",
      "Relational Database",
      "Integrity Constraints",
      "Relational Integrity Constraints",
      "Entity Integrity",
      "Referential Integrity",
      "Domain Constraints",
      "Relation Schema",
      "Relation Schema and Instance",
    ],
    keyIdeas: [
      "set of tuples",
      "no order",
      "no duplicate tuples",
      "atomic values",
      "domain",
      "entity integrity",
      "primary key not null",
      "referential integrity",
      "foreign key must match",
    ],
    probe:
      "A relation is often called a 'table', but it has rules a spreadsheet doesn't. What are the rules about the order of rows, duplicate rows and the value in a single cell?",
    hint1:
      "Think of a relation as a SET of tuples. What does 'set' imply about order and duplicates? And what must each attribute value look like?",
    hint2:
      "Sets have no order and no duplicates; every value is atomic and drawn from its attribute's domain. Now connect this to constraints: which one forbids NULL in a primary key, and which one says a foreign key must match an existing key?",
    workedStep:
      "A relation is a set of tuples over a schema R(A1, …, An): the order of tuples and of attributes does not matter, duplicate tuples are not allowed, and each value is atomic and belongs to the attribute's domain (or is NULL). Entity integrity: no primary-key attribute may be NULL. Referential integrity: every non-NULL foreign-key value must match a primary-key value in the referenced relation.",
    checkPrompt:
      "Deleting a Department row while Employee rows still reference it could break which constraint? Name one way a DBMS can handle it.",
    misconceptions: [
      {
        triggers: ["order matters", "rows are ordered", "first row", "sorted order"],
        label: "Thinks row order is part of a relation",
        nudge: "If you shuffled the rows, would any fact stored in the relation change?",
      },
      {
        triggers: ["foreign key cannot be null", "foreign key must not be null", "entity integrity is about foreign", "referential integrity means primary key"],
        label: "Confuses entity integrity with referential integrity",
        nudge: "One constraint protects a relation's own key; the other protects references to another relation. Which is which?",
      },
      {
        triggers: ["duplicates allowed", "duplicate rows are allowed", "can have duplicate"],
        label: "Allows duplicate tuples in a relation",
        nudge: "A relation is a set. How many copies of the same element can a set hold?",
      },
    ],
  },
  {
    concept: C.keys,
    aliases: [
      "Relational Keys",
      "Database Keys",
      "Types of Keys",
      "Super Key",
      "Super Keys",
      "Superkey",
      "Candidate Key",
      "Candidate Keys",
      "Primary Key",
      "Primary Keys",
      "Foreign Key",
      "Foreign Keys",
      "Alternate Key",
      "Keys Constraints",
      "Key Constraints",
      "Concepts of Super Key, Candidate Key, Primary Key",
      "Super Key, Candidate Key, Primary Key",
    ],
    keyIdeas: [
      "uniquely identifies",
      "super key",
      "candidate key",
      "minimal",
      "no proper subset",
      "primary key",
      "chosen by designer",
      "alternate key",
      "foreign key references",
    ],
    probe:
      "What's the difference between a super key and a candidate key? Use R(RollNo, Name, Email), where RollNo and Email are each unique, to explain.",
    hint1:
      "Both uniquely identify a tuple. The difference is minimality: can you remove an attribute from the set and still identify every tuple?",
    hint2:
      "{RollNo, Name} is a super key — but drop Name and RollNo alone still works. A candidate key is a super key with no redundant attribute. Which sets of R are candidate keys?",
    workedStep:
      "Super keys of R: {RollNo}, {Email}, {RollNo, Name}, {Email, Name}, {RollNo, Email} and {RollNo, Email, Name} — any set that uniquely identifies tuples. Candidate keys are the minimal ones, where no proper subset is still a super key: {RollNo} and {Email}. The designer picks one as the primary key (say RollNo); the other candidate key (Email) becomes an alternate key.",
    checkPrompt: "In R(A, B, C, D), A is the only candidate key. How many super keys does R have, and why?",
    misconceptions: [
      {
        triggers: ["all super keys are candidate", "rollno name is a candidate", "any unique set is a candidate", "super key is minimal"],
        label: "Treats every super key as a candidate key",
        nudge: "Take {RollNo, Name}. Remove Name. Does what's left still identify every student?",
      },
      {
        triggers: ["only one candidate key", "candidate key is the primary key", "one candidate key only"],
        label: "Thinks a relation has only one candidate key",
        nudge: "RollNo identifies a student. Does Email, on its own, identify a student too?",
      },
      {
        triggers: ["foreign key is unique", "foreign key must be unique", "foreign key cannot repeat"],
        label: "Thinks a foreign key must be unique in its own table",
        nudge: "Many employees work in the same department. What does that mean for the dept_id column in Employee?",
      },
    ],
  },
  {
    concept: C.algebra,
    aliases: [
      "Relational Algebra Operations",
      "Relational Algebra Operators",
      "Basic Relational Algebra",
      "Fundamental Relational Algebra Operations",
      "Extended Relational Algebra",
      "Relational Algebra and Calculus",
      "Selection and Projection",
      "Relational Operators",
      "Division Operation",
    ],
    keyIdeas: [
      "selection",
      "sigma",
      "filters rows",
      "projection",
      "pi",
      "picks columns",
      "removes duplicates",
      "cartesian product",
      "natural join",
      "division",
      "union compatible",
    ],
    probe:
      "For Employee(eid, name, dept, salary), write a relational algebra expression for the names of employees in the 'CSE' department. Which operator filters rows and which picks columns?",
    hint1:
      "Selection (σ) keeps tuples that satisfy a condition; projection (π) keeps chosen attributes. Which one has to be applied first here, and what is its condition?",
    hint2:
      "First σ with dept = 'CSE', then π on name. Write it inside-out: π_name( σ_… (Employee) ). Why would the other order fail?",
    workedStep:
      "π_name(σ_dept='CSE'(Employee)). σ_dept='CSE' keeps only CSE rows; π_name then keeps just the name column and, being a set operation, removes duplicate names. The other order fails: after π_name the dept attribute no longer exists to test.",
    checkPrompt: "When do you need the division operator? Give a query, in words, that requires it.",
    misconceptions: [
      {
        triggers: ["projection filters rows", "selection picks columns", "sigma selects columns", "pi filters", "pi is used to filter"],
        label: "Swaps selection and projection",
        nudge: "σ has a condition like dept = 'CSE'; π has a list of attribute names. Which of those describes rows?",
      },
      {
        triggers: ["projection keeps duplicates", "duplicates remain", "same number of tuples"],
        label: "Forgets that projection removes duplicates",
        nudge: "Relational algebra works on sets. If two employees are both called 'Ravi', how many 'Ravi' tuples can π_name return?",
      },
      {
        triggers: ["union of any relations", "no need to be compatible", "union works on any"],
        label: "Applies union to relations that aren't union-compatible",
        nudge: "What would a tuple in Employee ∪ Department even look like if the two schemas differ?",
      },
    ],
  },
  {
    concept: C.sql,
    aliases: [
      "SQL",
      "Basic SQL",
      "SQL Basics",
      "SQL Fundamentals",
      "Introduction to SQL",
      "Introduction on SQL",
      "Structured Query Language",
      "SQL Commands",
      "Types of SQL Commands",
      "Characteristics of SQL",
      "DDL",
      "DML",
      "DDL and DML",
      "DDL, DML",
      "Data Definition Language",
      "Data Manipulation Language",
      "Aggregate Functions",
      "Group By",
      "Group By and Having",
      "Having Clause",
      "Insert, Update and Delete Operations",
      "Update and Delete Operations",
      "SQL Data Types and Literals",
      "SQL Queries and Aggregates",
    ],
    keyIdeas: [
      "group by",
      "having",
      "where filters rows",
      "having filters groups",
      "aggregate",
      "avg",
      "count",
      "before grouping",
      "after grouping",
    ],
    probe:
      "Employee(eid, name, dept, salary): you need the departments whose average salary exceeds 50,000. Does the average condition go in WHERE or HAVING, and why?",
    hint1:
      "WHERE is evaluated for each row before any grouping happens. Can a row-level condition refer to AVG(salary), which only exists once rows are grouped?",
    hint2:
      "Aggregates are computed per group, so the condition belongs after GROUP BY dept. Which clause filters whole groups?",
    workedStep:
      "SELECT dept, AVG(salary) FROM Employee GROUP BY dept HAVING AVG(salary) > 50000; WHERE filters individual rows before grouping, GROUP BY forms one group per dept, and HAVING filters whole groups using aggregates. Logical order: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY.",
    checkPrompt: "What does COUNT(*) return compared with COUNT(salary) when some salary values are NULL?",
    misconceptions: [
      {
        triggers: ["where avg", "where count", "where sum", "in the where clause"],
        label: "Uses WHERE to filter on an aggregate",
        nudge: "At the moment WHERE runs, have any groups been formed yet? What would AVG be averaging?",
      },
      {
        triggers: ["count counts null", "count includes null", "same as count(*)", "same result"],
        label: "Thinks COUNT(column) counts NULLs",
        nudge: "COUNT(salary) counts salary values. Is a NULL a value you can count?",
      },
      {
        triggers: ["select name group by dept", "any column can be selected", "non aggregated column"],
        label: "Selects non-grouped columns in a GROUP BY query",
        nudge: "A CSE group has 30 employees. Which single name would SELECT name show for that group?",
      },
    ],
  },
  {
    concept: C.joins,
    aliases: [
      "Joins",
      "SQL Joins",
      "Join Operations",
      "Types of Joins",
      "Inner Join",
      "Outer Join",
      "Outer Joins",
      "Natural Join",
      "Left Outer Join",
      "Nested Queries",
      "Nested Subqueries",
      "Subqueries",
      "Sub Queries",
      "Queries and Sub Queries",
      "Correlated Subqueries",
      "Correlated Queries",
      "Joins and Subqueries",
      "Joins and Unions",
      "Joins, Unions, Intersection, Minus",
      "Set Operations in SQL",
    ],
    keyIdeas: [
      "matching rows",
      "inner join",
      "left outer join",
      "unmatched rows",
      "null",
      "subquery",
      "correlated",
      "outer query",
      "exists",
      "for each row",
    ],
    probe:
      "Employee(eid, name, dept_id) and Department(dept_id, dname): some employees have no department yet. Which join lists ALL employees with their department name, and what appears for those without one?",
    hint1:
      "An inner join keeps only rows that match on both sides. Which kind of join keeps every row of one side even when there's no match?",
    hint2:
      "A LEFT OUTER JOIN keeps every row of the left table. With Employee on the left, what value fills dname for an employee who has no matching department?",
    workedStep:
      "SELECT e.name, d.dname FROM Employee e LEFT OUTER JOIN Department d ON e.dept_id = d.dept_id; Every employee appears; for an employee whose dept_id is NULL or unmatched, d.dname is NULL. An inner join would silently drop those employees.",
    checkPrompt: "What makes a subquery 'correlated', and how often is it evaluated?",
    misconceptions: [
      {
        triggers: ["inner join shows all", "inner join keeps", "inner join includes all", "normal join"],
        label: "Expects an inner join to keep unmatched rows",
        nudge: "An employee with dept_id NULL: is there any Department row where d.dept_id = NULL is true?",
      },
      {
        triggers: ["runs once", "executed once", "evaluated only once"],
        label: "Thinks a correlated subquery runs only once",
        nudge: "The subquery mentions e.dept_id from the outer query. Whose dept_id is that — and how many outer rows are there?",
      },
      {
        triggers: ["right outer join", "right join"],
        label: "Confuses left and right outer joins",
        nudge: "Which table is written on the left of the JOIN keyword, and whose rows must all survive?",
      },
    ],
  },

  // Unit 3 · Functional Dependencies & Normalization
  {
    concept: C.fd,
    aliases: [
      "Functional Dependency",
      "FD",
      "FDs",
      "Functional Dependencies and Normalization",
      "Armstrong's Axioms",
      "Armstrongs Axioms",
      "Armstrong Axioms",
      "Inference Rules for Functional Dependencies",
      "Trivial Functional Dependency",
      "Canonical Cover",
      "Minimal Cover",
      "Irreducible Set of Functional Dependencies",
    ],
    keyIdeas: [
      "two tuples agree",
      "same value",
      "determines",
      "trivial",
      "subset",
      "reflexivity",
      "augmentation",
      "transitivity",
      "armstrong",
    ],
    probe:
      "In your own words: what does the functional dependency A → B require of every legal instance of a relation?",
    hint1: "Take any two tuples. If they have the same A value, what must be true of their B values?",
    hint2:
      "They must have the same B value too. Now: is {StudentID, CourseID} → StudentID trivial? Compare its right side with its left side.",
    workedStep:
      "A → B means: for any two tuples t1, t2, if t1[A] = t2[A] then t1[B] = t2[B] — the value of A determines the value of B. X → Y is trivial when Y ⊆ X (e.g. {StudentID, CourseID} → StudentID); it holds in every relation. Armstrong's axioms: reflexivity (Y ⊆ X ⇒ X → Y), augmentation (X → Y ⇒ XZ → YZ) and transitivity (X → Y and Y → Z ⇒ X → Z).",
    checkPrompt: "Given A → B and B → C, which Armstrong axiom lets you conclude A → C?",
    misconceptions: [
      {
        triggers: ["b determines a", "b decides a", "b gives a", "the other way"],
        label: "Reads A → B as 'B determines A'",
        nudge: "In A → B, which side do you look up, and which side is forced to match?",
      },
      {
        triggers: ["current data", "this table only", "sample rows prove", "holds because the rows"],
        label: "Infers an FD from one sample instance",
        nudge: "Five rows happen to agree today. Does that guarantee every future legal instance will?",
      },
      {
        triggers: ["not trivial", "non-trivial because", "trivial if right side is bigger"],
        label: "Confuses trivial and non-trivial dependencies",
        nudge: "Is StudentID contained in {StudentID, CourseID}? What does that make the FD?",
      },
    ],
  },
  {
    concept: C.closure,
    aliases: [
      "Closure",
      "Closure of Attributes",
      "Closure of Attribute Sets",
      "Closure of an Attribute Set",
      "Closure of a Set of Attributes",
      "Attribute Set Closure",
      "Closure of Functional Dependencies",
      "Closure of a Set of Functional Dependencies",
      "Closure of FDs",
      "Finding Candidate Keys",
      "Finding Candidate Keys Using Closure",
    ],
    keyIdeas: [
      "start with",
      "add right side",
      "left side contained",
      "repeat until no change",
      "closure contains all attributes",
      "candidate key",
      "minimal",
      "never on the right side",
    ],
    probe:
      "R(A, B, C, D, E) with F = {A → B, B → C, CD → E}. How would you compute A⁺, and is A a key of R?",
    hint1:
      "Start with A⁺ = {A}. Repeatedly scan F: whenever the whole left side of an FD is inside your current set, add its right side. Stop when nothing changes.",
    hint2:
      "A → B adds B; B → C adds C. Can CD → E fire? You need both C and D in the set. So what is A⁺, and does it contain every attribute of R?",
    workedStep:
      "A⁺: {A} → add B (A → B) → add C (B → C) = {A, B, C}; CD → E cannot fire because D is missing. A⁺ ≠ R, so A is not a key. A and D never appear on the right side of any FD, so every key must contain both. (AD)⁺ = {A, D, B, C, E} = R, while A⁺ and D⁺ = {D} are not R — so AD is a candidate key, and the only one.",
    checkPrompt:
      "Why must an attribute that never appears on the right-hand side of any FD be part of every candidate key?",
    misconceptions: [
      {
        triggers: ["a is a key", "a is the key", "a is a candidate key", "determines b and c so"],
        label: "Calls X a key without checking X⁺ = R",
        nudge: "List A⁺ again. Is every attribute of R in it — including D and E?",
      },
      {
        triggers: ["c → e", "c -> e", "c gives e", "add e", "e is added"],
        label: "Fires an FD with only part of its left side",
        nudge: "CD → E needs C AND D in the set. Is D in A⁺ yet?",
      },
      {
        triggers: ["a+ = ab", "a+ = {a, b}", "only b", "just b"],
        label: "Stops computing the closure too early",
        nudge: "After adding B, scan F again. Does any FD now have its whole left side in {A, B}?",
      },
    ],
  },
  {
    concept: C.normalForms,
    // No bare "Normal Forms" alias: its tokens would also claim "Fourth Normal Form" topics;
    // plain "Normal Forms" still resolves through "Normalization" on token overlap.
    aliases: [
      "Normalization",
      "Normalisation",
      "Normalization Using Functional Dependencies",
      "Database Design and Normalization",
      "First Normal Form",
      "Second Normal Form",
      "Third Normal Form",
      "1NF",
      "2NF",
      "3NF",
      "1NF, 2NF, 3NF",
      "1NF, 2NF and 3NF",
      "First, Second, Third Normal Forms",
      "First, Second and Third Normal Forms",
      "Anomalies",
      "Update Anomalies",
      "Insertion, Deletion and Update Anomalies",
      "Partial Dependency",
      "Transitive Dependency",
    ],
    keyIdeas: [
      "partial dependency",
      "part of a candidate key",
      "non-prime attribute",
      "transitive dependency",
      "non-key determines non-key",
      "2nf",
      "3nf",
      "atomic",
      "decompose",
    ],
    probe:
      "R(StudentID, CourseID, StudentName, Grade) has key {StudentID, CourseID} and StudentID → StudentName. Which normal form does R violate, and why?",
    hint1:
      "Look at the left side of StudentID → StudentName. Is it the whole candidate key, a proper part of it, or a non-key attribute?",
    hint2:
      "It's a proper part of the key, and StudentName is non-prime — a partial dependency. Which normal form forbids partial dependencies of non-prime attributes?",
    workedStep:
      "StudentName depends on StudentID alone, a proper subset of the key {StudentID, CourseID}: a partial dependency of a non-prime attribute, so R is in 1NF but not 2NF. Fix: decompose into Student(StudentID, StudentName) and Enrollment(StudentID, CourseID, Grade). 3NF goes further and forbids transitive dependencies: for every non-trivial X → A, X must be a super key or A must be prime.",
    checkPrompt: "Explain the difference between a partial dependency and a transitive dependency, with one example of each.",
    misconceptions: [
      {
        triggers: ["transitive", "violates 3nf"],
        label: "Confuses partial and transitive dependencies",
        nudge: "Is StudentID a non-key attribute, or is it part of the key? Which kind of dependency starts from part of a key?",
      },
      {
        triggers: ["composite key means", "composite key so not 2nf", "because the key is composite"],
        label: "Thinks a composite key alone breaks 2NF",
        nudge: "A composite key is fine on its own. What has to depend on only part of it for 2NF to fail?",
      },
      {
        triggers: ["any dependency violates", "prime attribute violates", "every fd must have a key"],
        label: "Ignores the 'A is prime' condition of 3NF",
        nudge: "3NF allows X → A when X isn't a super key in one case. What must be true of A?",
      },
    ],
  },
  {
    concept: C.bcnf,
    aliases: [
      "Boyce-Codd Normal Form",
      "Boyce Codd Normal Form",
      "Boyce/Codd Normal Form",
      "Boyce-Codd NF",
      "BCNF Decomposition",
      "3NF vs BCNF",
      "Comparison of 3NF and BCNF",
    ],
    keyIdeas: [
      "every determinant",
      "super key",
      "non-trivial",
      "stricter than 3nf",
      "prime attribute exception",
      "lossless",
      "may not preserve dependencies",
    ],
    probe:
      "R(Student, Course, Instructor): each instructor teaches one course (Instructor → Course) and {Student, Course} → Instructor. Is R in BCNF? Is it in 3NF?",
    hint1: "BCNF asks one question of every non-trivial FD X → Y: is X a super key? Start with Instructor → Course.",
    hint2:
      "Instructor alone doesn't determine Student, so it isn't a super key — BCNF is violated. For 3NF there's an escape clause: is Course a prime attribute (part of some candidate key)?",
    workedStep:
      "Candidate keys: {Student, Course} and {Student, Instructor}. Instructor → Course violates BCNF because Instructor is not a super key. But Course is prime (it belongs to the key {Student, Course}), so 3NF allows it: R is in 3NF but not BCNF. Decomposing on Instructor → Course gives R1(Instructor, Course) and R2(Student, Instructor) — lossless, but {Student, Course} → Instructor can no longer be checked inside one table.",
    checkPrompt: "Why is every relation with exactly two attributes in BCNF?",
    misconceptions: [
      {
        triggers: ["same as 3nf", "3nf is bcnf", "if 3nf then bcnf", "no difference"],
        label: "Thinks 3NF and BCNF are the same",
        nudge: "3NF has an extra escape clause about prime attributes. Does BCNF have it?",
      },
      {
        triggers: ["course is prime so", "prime so bcnf", "prime attribute allowed"],
        label: "Applies the 3NF prime-attribute exception to BCNF",
        nudge: "Read the BCNF condition again: it only asks about the left side. Is Instructor a super key?",
      },
      {
        triggers: ["always preserves", "preserves all dependencies", "dependency preserving always"],
        label: "Expects BCNF decomposition to preserve every dependency",
        nudge: "After splitting into (Instructor, Course) and (Student, Instructor), which table can check {Student, Course} → Instructor?",
      },
    ],
  },
  {
    concept: C.lossless,
    aliases: [
      "Lossless Join Decomposition",
      "Lossless-Join Decompositions",
      "Lossless Join Decompositions",
      "Lossless Decomposition",
      "Lossless Join",
      "Loss Less Join Decomposition",
      "Loss Less Join Decompositions",
      "Non-loss Decomposition",
      "Nonloss Decomposition",
      "Decomposition",
      "Properties of Decomposition",
      "Desirable Properties of Decomposition",
      "Lossy Decomposition",
      "Spurious Tuples",
    ],
    keyIdeas: [
      "common attributes",
      "intersection",
      "super key",
      "of r1 or r2",
      "closure",
      "no spurious tuples",
      "join gives back r",
    ],
    probe:
      "R(A, B, C) with F = {A → B} is decomposed into R1(A, B) and R2(A, C). Is the decomposition lossless? Which test do you use?",
    hint1:
      "Use the binary test: find the common attributes R1 ∩ R2. The decomposition is lossless if they functionally determine all of R1 or all of R2.",
    hint2: "Here R1 ∩ R2 = {A}. Compute A⁺ under F. Does it contain all of R1 = {A, B}?",
    workedStep:
      "R1 ∩ R2 = {A} and A⁺ = {A, B} ⊇ R1, so A is a super key of R1 and the decomposition is lossless: R1 ⋈ R2 = R for every legal instance. If the common attributes determined neither side, the natural join could create spurious tuples — a lossy decomposition.",
    checkPrompt: "What are spurious tuples, and why do they mean information is lost even though the join returns MORE rows?",
    misconceptions: [
      {
        triggers: ["fewer tuples", "rows are lost", "less rows", "tuples are missing"],
        label: "Thinks 'lossy' means tuples disappear",
        nudge: "Join the two pieces of a lossy decomposition. Do you get fewer rows than R, or extra ones you can't tell apart?",
      },
      {
        triggers: ["key of the original relation", "determine the whole relation", "must be a key of r"],
        label: "Requires the common attributes to be a key of R",
        nudge: "The test only needs R1 ∩ R2 to determine one of the two pieces. Which piece does A determine here?",
      },
      {
        triggers: ["all attributes are present", "union is r", "covers all attributes"],
        label: "Only checks that the pieces cover all attributes",
        nudge: "R1(A, B) and R2(C, D) also cover all attributes of R(A, B, C, D). Can you join them back without inventing rows?",
      },
    ],
  },
  {
    concept: C.depPreservation,
    aliases: [
      "Dependency Preserving Decomposition",
      "Dependency-Preserving Decomposition",
      "Dependency Preservation Property",
      "Preservation of Dependencies",
    ],
    keyIdeas: [
      "projection of f",
      "union of projections",
      "closure equals f+",
      "check within one table",
      "without a join",
      "3nf synthesis preserves",
      "bcnf may not preserve",
    ],
    probe:
      "R(A, B, C) with F = {A → B, B → C} is decomposed into R1(A, B) and R2(A, C). Is it dependency preserving?",
    hint1:
      "Project F onto each piece: which FDs (including implied ones) hold using only R1's attributes? Only R2's?",
    hint2: "R1 gets A → B; R2 gets A → C (implied through B). Can you derive B → C from {A → B, A → C}?",
    workedStep:
      "F1 = {A → B} on R1(A, B); F2 = {A → C} on R2(A, C), since A → C ∈ F⁺. From {A → B, A → C} you cannot derive B → C, so (F1 ∪ F2)⁺ ≠ F⁺: the decomposition is not dependency preserving — checking B → C would need a join. It is lossless (A is a key of R1). R1(A, B), R2(B, C) is both lossless and dependency preserving.",
    checkPrompt: "Why can a BCNF decomposition fail to preserve dependencies, while 3NF synthesis never does?",
    misconceptions: [
      {
        triggers: ["lossless so", "lossless means preserving", "because it is lossless"],
        label: "Thinks lossless implies dependency preserving",
        nudge: "These are two separate properties. This decomposition is lossless — can R1 or R2 on its own check B → C?",
      },
      {
        triggers: ["a → c is not in f", "a->c not given", "not in the original f"],
        label: "Ignores implied dependencies when projecting F",
        nudge: "Projections use F⁺, not just F. Does A → C follow from A → B and B → C?",
      },
      {
        triggers: ["bcnf always preserves", "always dependency preserving"],
        label: "Believes BCNF decomposition always preserves dependencies",
        nudge: "Recall the Student–Course–Instructor example. Which FD got split across two tables?",
      },
    ],
  },

  // Unit 4 · Transactions & Concurrency Control
  {
    concept: C.acid,
    aliases: [
      "ACID",
      "ACID Property",
      "Transaction Properties",
      "Properties of Transactions",
      "Properties of a Transaction",
      "Transactions",
      "Transaction",
      "Transaction Concept",
      "Transaction Concepts",
      "Transaction Processing",
      "Transaction Processing Concept",
      "Transaction Processing Concepts",
      "Transaction System",
      "Transaction States",
      "Transaction State Diagram",
      "States of a Transaction",
    ],
    keyIdeas: [
      "atomicity",
      "all or nothing",
      "consistency",
      "isolation",
      "durability",
      "committed changes survive",
      "recovery manager",
      "concurrency control",
      "undo",
    ],
    probe:
      "A transfer of ₹500 from account A to B crashes after debiting A but before crediting B. Which ACID property is at risk, and what must the DBMS do on restart?",
    hint1: "Think 'all or nothing'. Should the database be allowed to keep half of this transaction?",
    hint2:
      "Atomicity says the partial debit must be undone. Which component uses the log to roll it back — and what would durability protect instead?",
    workedStep:
      "Atomicity is at risk: a transaction happens completely or not at all. On restart the recovery manager uses the log to UNDO the debit of A, because the transaction never committed. Consistency: a correct transaction preserves invariants (A + B unchanged). Isolation: concurrent transactions behave as if run one after another (concurrency control). Durability: once committed, changes survive crashes (log + recovery).",
    checkPrompt: "Which DBMS component is responsible for isolation, and which for durability?",
    misconceptions: [
      {
        triggers: ["consistency is at risk", "it is consistency", "consistency because"],
        label: "Confuses atomicity with consistency",
        nudge: "Consistency is the goal; which property describes the 'all or nothing' mechanism that protects it here?",
      },
      {
        triggers: ["durability is at risk", "it is durability", "durability because", "durability property"],
        label: "Thinks durability protects uncommitted changes",
        nudge: "Durability is a promise about COMMITTED transactions. Did this transfer commit?",
      },
      {
        triggers: ["one at a time", "run serially", "no concurrency", "one transaction at a time"],
        label: "Thinks isolation means transactions never run concurrently",
        nudge: "Isolation is about the RESULT looking serial. Do the operations themselves have to run one at a time?",
      },
    ],
  },
  {
    concept: C.schedules,
    aliases: [
      "Schedule",
      "Serial Schedule",
      "Serial Schedules",
      "Non-Serial Schedules",
      "Serial and Non-Serial Schedules",
      "Concurrent Schedules",
      "Concurrent Executions",
      "Concurrent Execution of Transactions",
      "Need for Concurrency",
      "Concurrency Problems",
      "Lost Update Problem",
      "Dirty Read",
    ],
    keyIdeas: [
      "serial",
      "one after another",
      "interleaved",
      "order within a transaction preserved",
      "lost update",
      "dirty read",
      "stale value",
    ],
    probe:
      "T1 and T2 both read balance X = 100. T1 adds 50 and writes; then T2 subtracts 30 and writes. What is the final X, and what went wrong?",
    hint1:
      "Write out the interleaving: r1(X) r2(X) w1(X) w2(X). Which value does T2 read, and does it ever see T1's write?",
    hint2:
      "T2 read 100 before T1 wrote 150, so T2 writes 100 − 30 = 70, overwriting T1's update. What is this anomaly called, and what would a serial execution give?",
    workedStep:
      "Both read 100. T1 writes 150, then T2 writes 70 from its stale read — T1's update is lost (the lost-update problem). Either serial order (T1 then T2, or T2 then T1) gives 120. A schedule is serial when transactions run one after another with no interleaving; a concurrent schedule interleaves operations but must keep each transaction's own operations in order.",
    checkPrompt: "How many different serial schedules are possible for 3 transactions, and why?",
    misconceptions: [
      {
        triggers: ["120", "same as serial", "no problem"],
        label: "Assumes interleaving can't change the result",
        nudge: "Trace the values step by step. What number does T2 subtract 30 from?",
      },
      {
        triggers: ["dirty read", "uncommitted"],
        label: "Confuses a lost update with a dirty read",
        nudge: "Did either transaction read a value written by an uncommitted transaction here, or did one write simply overwrite the other?",
      },
      {
        triggers: ["reorder within", "change the order of t1", "swap t1 operations"],
        label: "Thinks a schedule may reorder a transaction's own operations",
        nudge: "Interleaving mixes transactions. Can it change the order in which T1 itself reads and then writes?",
      },
    ],
  },
  {
    concept: C.conflict,
    aliases: [
      "Conflict Serializable Schedule",
      "Conflict Serializable Schedules",
      "Conflict Serializable",
      "Serializability",
      "Testing of Serializability",
      "Test for Serializability",
      "Testing for Serializability",
      "Serializability Testing",
      "Serializability of Schedules",
      "Serializability of Scheduling",
      "Precedence Graph",
      "Serialization Graph",
      "Conflict Equivalence",
      "Conflict Equivalent Schedules",
      "Conflict and View Serializability",
      "Conflict & View Serializable Schedule",
      "Conflict and View Serializable Schedules",
    ],
    keyIdeas: [
      "different transactions",
      "same data item",
      "at least one write",
      "precedence graph",
      "edge",
      "cycle",
      "acyclic",
      "topological order",
      "swap non-conflicting",
    ],
    probe:
      "In S: r1(X) r2(X) w1(X) w2(X), which pairs of operations conflict? State the rule you're using.",
    hint1:
      "Two operations conflict only if all three hold: they belong to different transactions, they access the same data item, and at least one of them is a write. Check r1(X), r2(X) against the third condition.",
    hint2:
      "Two reads never conflict. So the conflicting pairs here are r1(X)–w2(X), r2(X)–w1(X) and w1(X)–w2(X). Draw an edge Ti → Tj for each pair where Ti's operation comes first. What do you get?",
    workedStep:
      "Conflicts in order: r1(X) before w2(X) gives T1 → T2; r2(X) before w1(X) gives T2 → T1; w1(X) before w2(X) gives T1 → T2. The precedence graph has T1 → T2 and T2 → T1 — a cycle — so S is NOT conflict serializable. Rule: a schedule is conflict serializable iff its precedence graph is acyclic, and then any topological order of the graph is an equivalent serial schedule.",
    checkPrompt:
      "A precedence graph has only the edges T1 → T2 and T3 → T2. Is the schedule conflict serializable, and what is one equivalent serial order?",
    misconceptions: [
      {
        triggers: ["r1(x) and r2(x)", "both read", "two reads", "read read", "read-read", "all pairs", "every pair"],
        label: "Counts read–read pairs as conflicts",
        nudge: "Does the order of two reads ever change what either transaction sees? Which of the three conflict conditions do they fail?",
      },
      {
        triggers: ["edge from later", "reverse edge", "later to earlier", "wrong direction"],
        label: "Draws precedence edges in the wrong direction",
        nudge: "An edge Ti → Tj says 'Ti must come before Tj'. Whose operation appeared first in the schedule?",
      },
      {
        triggers: ["view equivalent", "view serializable", "final write", "blind write"],
        label: "Confuses conflict with view serializability",
        nudge: "Conflict serializability only asks about conflicting pairs and the precedence graph. Which test are you actually applying?",
      },
    ],
  },
  {
    concept: C.view,
    aliases: [
      "View Serializable Schedule",
      "View Serializable Schedules",
      "View Serializable",
      "View Equivalence",
      "View Equivalent Schedules",
      "Blind Writes",
      "Blind Write",
    ],
    keyIdeas: [
      "initial read",
      "reads from",
      "final write",
      "same in both schedules",
      "blind write",
      "conflict serializable implies view serializable",
      "np-complete",
    ],
    probe: "Two schedules are view equivalent under three conditions. Can you name them?",
    hint1:
      "Think about what each transaction 'sees' and what the database ends with: who reads the initial value of each item, who reads from whom, and who writes last.",
    hint2:
      "The conditions are about initial reads, reads-from pairs and final writes. Why might a schedule with a cycle in its precedence graph still satisfy all three? (Hint: a write that nobody reads.)",
    workedStep:
      "S and S' are view equivalent if, for every data item: (1) the same transaction reads its initial value, (2) every read reads the value written by the same transaction in both, and (3) the same transaction performs the final write. Example: r1(X) w2(X) w1(X) w3(X) has the cycle T1 → T2 → T1, so it is not conflict serializable, yet it is view equivalent to T1 T2 T3 — T2 and T3 write X blindly and T3's final write overwrites the rest. Every conflict-serializable schedule is view serializable, not vice versa; testing view serializability is NP-complete.",
    checkPrompt: "Why must a schedule that is view serializable but not conflict serializable contain a blind write?",
    misconceptions: [
      {
        triggers: ["same as conflict", "equivalent to conflict", "no difference", "both are same"],
        label: "Thinks view and conflict serializability are the same",
        nudge: "Is r1(X) w2(X) w1(X) w3(X) conflict serializable? Is it view serializable?",
      },
      {
        triggers: ["only final write", "just the last write", "only the last write"],
        label: "Checks only the final write",
        nudge: "Two schedules can end with the same writer and still let a transaction read different values. Which other conditions catch that?",
      },
      {
        triggers: ["cycle means not view", "not view serializable because cycle", "has a cycle so"],
        label: "Believes a precedence-graph cycle rules out view serializability",
        nudge: "The precedence graph is the conflict test. Can blind writes make a schedule view equivalent to a serial one anyway?",
      },
    ],
  },
  {
    concept: C.recoverability,
    aliases: [
      "Recoverable Schedules",
      "Recoverable Schedule",
      "Recoverability of Schedules",
      "Recoverable and Cascadeless Schedules",
      "Cascadeless Schedules",
      "Cascadeless Schedule",
      "Cascading Rollback",
      "Cascading Rollbacks",
      "Cascading Abort",
      "Strict Schedules",
      "Strict Schedule",
    ],
    keyIdeas: [
      "reads from",
      "commits before",
      "commit order",
      "cascading rollback",
      "cascadeless",
      "only committed data",
      "strict",
    ],
    probe:
      "In S: w1(X) r2(X) c2 c1, T2 reads X written by T1 and commits first. If T1 now aborts, what's the problem? Is S recoverable?",
    hint1: "T2 has already committed using a value that T1 is about to undo. Can the DBMS still roll T2 back?",
    hint2:
      "A committed transaction can't be undone, so the database is left inconsistent. Recoverability is a rule about commit order: if Tj reads from Ti, whose commit must come first?",
    workedStep:
      "S is NOT recoverable: T2 read X from T1 and committed before T1; if T1 aborts, T2's committed result depends on a value that never existed. Recoverable: if Tj reads from Ti, Ti commits before Tj commits. Cascadeless: transactions read only committed values, so one abort never forces others to roll back. Strict: no read or write of X until the last writer of X has committed or aborted. Strict ⊂ cascadeless ⊂ recoverable.",
    checkPrompt: "Why does a cascadeless schedule never need a cascading rollback? One or two sentences.",
    misconceptions: [
      {
        triggers: ["recoverable means no cascading", "recoverable so no rollback", "cascadeless is the same"],
        label: "Confuses recoverable with cascadeless",
        nudge: "In w1(X) r2(X) c1 c2, T1 commits first, yet T2 read uncommitted data. Which of the two properties holds?",
      },
      {
        triggers: ["roll back t2", "rollback t2", "undo t2", "abort t2 as well"],
        label: "Thinks a committed transaction can still be rolled back",
        nudge: "T2 has already committed — the user was told it succeeded. Does durability let the DBMS take that back?",
      },
      {
        triggers: ["commit order doesn't matter", "not related to commit", "commit order does not matter"],
        label: "Ignores commit order when checking recoverability",
        nudge: "Swap c2 and c1 in the schedule. Could T2 still be rolled back if T1 aborted?",
      },
    ],
  },
  {
    concept: C.twoPL,
    aliases: [
      "2PL",
      "Two Phase Locking",
      "Two Phase Locking Protocol",
      "Two-Phase Locking Protocol",
      "Strict Two-Phase Locking",
      "Strict 2PL",
      "Rigorous 2PL",
      "Lock-Based Protocols",
      "Lock Based Protocols",
      "Locking Protocols",
      "Locking Techniques",
      "Locking Techniques for Concurrency Control",
      "Shared and Exclusive Locks",
      "Lock Compatibility Matrix",
      "Concurrency Control",
      "Concurrency Control Protocols",
    ],
    keyIdeas: [
      "growing phase",
      "shrinking phase",
      "acquire locks",
      "release locks",
      "no new lock after release",
      "lock point",
      "conflict serializable",
      "strict 2pl",
      "does not prevent deadlock",
    ],
    probe: "Describe the two phases of the two-phase locking protocol. What exactly is forbidden?",
    hint1:
      "Picture a transaction's number of held locks over time: it rises, then falls. What's the rule about acquiring a lock after you've released one?",
    hint2:
      "Growing phase: acquire, never release. Shrinking phase: release, never acquire. Why does that make the order of the transactions' 'lock points' a valid serial order?",
    workedStep:
      "Growing phase: the transaction may acquire shared/exclusive locks but release none. Shrinking phase: it may release locks but acquire none — once any lock is released, no new lock may be requested. The instant the last lock is acquired is the lock point; ordering transactions by lock point gives an equivalent serial schedule, so 2PL guarantees conflict serializability. It does NOT prevent deadlocks or cascading rollbacks; strict 2PL (hold exclusive locks until commit) avoids cascading rollbacks.",
    checkPrompt: "Does basic 2PL prevent deadlocks? Justify with a two-transaction example.",
    misconceptions: [
      {
        triggers: ["prevents deadlock", "no deadlock", "deadlock free", "avoids deadlock"],
        label: "Thinks 2PL prevents deadlocks",
        nudge: "T1 locks A, T2 locks B, then each requests the other's item. Has either broken the 2PL rules? What happens next?",
      },
      {
        triggers: ["read phase", "write phase", "first read then write", "read lock phase"],
        label: "Thinks the two phases are 'read' and 'write'",
        nudge: "The phases are about lock ACQUISITION versus RELEASE, not about reading or writing. What changes at the lock point?",
      },
      {
        triggers: ["acquire again", "lock again after", "release and then lock"],
        label: "Believes locks may be acquired after a release",
        nudge: "If T1 unlocks A and later locks B, another transaction can slip in between. Why does that break serializability?",
      },
    ],
  },
  {
    concept: C.deadlocks,
    aliases: [
      "Deadlock",
      "Deadlock Handling",
      "Deadlock Detection",
      "Deadlock Prevention",
      "Deadlock Avoidance",
      "Deadlock Detection and Prevention",
      "Deadlock Detection and Recovery",
      "Wait-for Graph",
      "Wait-Die",
      "Wound-Wait",
      "Wait-Die and Wound-Wait",
    ],
    keyIdeas: [
      "wait-for graph",
      "cycle",
      "victim",
      "rollback",
      "older",
      "younger",
      "wait-die",
      "wound-wait",
      "timestamp",
    ],
    probe:
      "T1 holds a lock on A and wants B; T2 holds B and wants A. How would the DBMS detect this situation?",
    hint1: "Build a graph whose nodes are transactions. When should there be an edge Ti → Tj?",
    hint2:
      "Draw Ti → Tj when Ti waits for a lock held by Tj. Here you get T1 → T2 and T2 → T1. What structure in this graph means deadlock, and what does the DBMS do next?",
    workedStep:
      "In the wait-for graph, Ti → Tj means Ti waits for Tj. T1 → T2 and T2 → T1 form a cycle, so there is a deadlock; the DBMS checks for cycles periodically and breaks one by rolling back a victim (e.g. the youngest transaction or the one with the least work). Prevention avoids cycles using timestamps: wait-die lets an older requester wait but kills a younger requester; wound-wait lets an older requester wound (abort) the younger holder, while a younger requester waits.",
    checkPrompt:
      "Under wait-die, an older transaction requests a lock held by a younger one. What happens, and why can't this lead to a deadlock?",
    misconceptions: [
      {
        triggers: ["older is aborted", "older dies", "older transaction is killed", "younger waits in wait-die"],
        label: "Swaps the wait-die and wound-wait rules",
        nudge: "In both schemes the OLDER transaction is favoured. In wait-die, which one ever waits?",
      },
      {
        triggers: ["cycle is fine", "will resolve itself", "just wait"],
        label: "Thinks a wait-for cycle resolves itself",
        nudge: "Each transaction in the cycle waits for the next. Who could ever release a lock first?",
      },
      {
        triggers: ["from holder", "t2 → t1 because t2 holds", "holder to waiter"],
        label: "Draws wait-for edges from the lock holder to the waiter",
        nudge: "The edge reads 'is waiting for'. Which transaction is doing the waiting?",
      },
    ],
  },
  {
    concept: C.timestamp,
    aliases: [
      "Timestamp Ordering Protocol",
      "Timestamp-Based Protocols",
      "Timestamp Based Protocols",
      "Timestamp-Based Concurrency Control",
      "Timestamp Based Concurrency Control",
      "Timestamp Concurrency Control",
      "Time Stamping Protocols",
      "Time Stamping Protocols for Concurrency Control",
      "Timestamping Protocols",
      "Timestamp Protocol",
      "Timestamp",
      "Timestamps",
      "Basic Timestamp Ordering",
      "Thomas Write Rule",
      "Thomas' Write Rule",
    ],
    keyIdeas: [
      "timestamp order",
      "older",
      "read timestamp",
      "write timestamp",
      "rolled back",
      "restart with a new timestamp",
      "thomas write rule",
      "ignore obsolete write",
      "deadlock free",
    ],
    probe:
      "Under basic timestamp ordering, T with TS(T) = 5 wants to write X, but R-timestamp(X) = 8. What happens, and why?",
    hint1:
      "R-timestamp(X) = 8 means a younger transaction (TS 8) has already read X. Timestamp order says T (TS 5) comes before it. Is T's write still consistent with that order?",
    hint2:
      "The younger transaction already read the old value, so T's write arrives 'too late'. The protocol never blocks — so what does it do to T?",
    workedStep:
      "Write rule: if TS(T) < R-TS(X), a younger transaction already read X, so T's write would break timestamp order — T is rolled back and restarted with a new timestamp. If TS(T) < W-TS(X), the write is obsolete: basic TO rolls T back, while Thomas' write rule simply ignores the write. Otherwise write X and set W-TS(X) = TS(T). Read rule: if TS(T) < W-TS(X) roll T back; else read and set R-TS(X) = max(R-TS(X), TS(T)). No transaction ever waits, so timestamp ordering is deadlock free.",
    checkPrompt: "What does Thomas' write rule change compared with basic timestamp ordering, and why is it safe?",
    misconceptions: [
      {
        triggers: ["t waits", "it waits", "wait until", "blocked"],
        label: "Thinks timestamp ordering makes transactions wait",
        nudge: "Timestamp ordering has no locks and no waiting. What is its only way to handle an operation that arrives too late?",
      },
      {
        triggers: ["write timestamp is 8", "compare with write timestamp", "w-ts is 8"],
        label: "Compares against the wrong timestamp",
        nudge: "For a write, which timestamp tells you a younger transaction already READ the item?",
      },
      {
        triggers: ["deadlock can occur", "may deadlock", "causes deadlock"],
        label: "Thinks timestamp ordering can deadlock",
        nudge: "A deadlock needs transactions waiting on each other. Does anyone ever wait under this protocol?",
      },
    ],
  },

  // Unit 5 · Recovery & Indexing
  {
    concept: C.logRecovery,
    aliases: [
      "Log Based Recovery",
      "Log-Based Recovery Techniques",
      "Recovery",
      "Recovery System",
      "Recovery Techniques",
      "Recovery Concepts",
      "Database Recovery",
      "Database Recovery Techniques",
      "Crash Recovery",
      "Recovery from Transaction Failures",
      "Recovery from Transaction Failure",
      "Recovery Based on Deferred and Immediate Update",
      "Deferred Database Modification",
      "Immediate Database Modification",
      "Deferred Update",
      "Immediate Update",
      "Write-Ahead Logging",
      "Write Ahead Logging",
      "WAL",
      "Undo and Redo",
      "Failure Classification",
    ],
    keyIdeas: [
      "log",
      "write-ahead",
      "log record before data",
      "undo",
      "redo",
      "commit record",
      "old value",
      "new value",
      "deferred",
      "immediate",
    ],
    probe:
      "After a crash the log shows <T1 start> … <T1 commit> and <T2 start> … with no commit for T2. With immediate modification, which transaction is undone and which is redone?",
    hint1:
      "Immediate modification means updates may reach the database before commit. Whose changes may be on disk but must not survive?",
    hint2:
      "A transaction with a <commit> record must survive (durability); one without must vanish (atomicity). Which of undo/redo uses the old value, and which the new value?",
    workedStep:
      "T1 has <T1 commit>, so REDO T1 (reapply new values — its writes may not have reached disk). T2 has <T2 start> but no commit, so UNDO T2 (restore old values, scanning the log backwards). Write-ahead logging makes this possible: the log record <T, X, old, new> must reach stable storage before X itself is written. With deferred modification nothing reaches the database before commit, so only redo is ever needed and log records need no old value.",
    checkPrompt: "Why does the deferred-modification scheme never need an UNDO operation?",
    misconceptions: [
      {
        triggers: ["undo t1", "undo both", "roll back t1", "undo all"],
        label: "Undoes committed transactions",
        nudge: "T1 wrote <T1 commit> before the crash. What does durability promise about its changes?",
      },
      {
        triggers: ["undo uses new", "redo uses old", "undo with the new value", "redo with old value"],
        label: "Mixes up which value undo and redo use",
        nudge: "Undo takes the database back to before the transaction. Which value in <T, X, old, new> is from before?",
      },
      {
        triggers: ["log after", "write data first", "log later"],
        label: "Thinks data may be written before its log record",
        nudge: "If X reached disk and the crash hit before its log record did, how would recovery know how to undo X?",
      },
    ],
  },
  {
    concept: C.checkpoints,
    aliases: ["Checkpoint", "Checkpointing", "Checkpoint Mechanism", "Checkpoints in Recovery", "Fuzzy Checkpoints", "Fuzzy Checkpoint"],
    keyIdeas: [
      "checkpoint",
      "flush log records",
      "flush modified buffers",
      "list of active transactions",
      "scan back to the last checkpoint",
      "ignore transactions committed before",
      "redo",
      "undo",
    ],
    probe: "Why does a DBMS take checkpoints at all? What would recovery have to do without them?",
    hint1:
      "Without checkpoints, how far back in the log would recovery have to scan, and how many committed transactions would it redo?",
    hint2:
      "A checkpoint forces log records and modified buffer blocks to disk and writes <checkpoint L> listing the active transactions. So which transactions that committed BEFORE the checkpoint can recovery ignore?",
    workedStep:
      "At a checkpoint the DBMS writes all log records and all modified buffer blocks to stable storage, then writes <checkpoint L>, where L lists the active transactions. After a crash, transactions that committed before the checkpoint are already safe on disk and are ignored. Recovery scans back only to the last checkpoint: it redoes transactions that committed after it, and undoes transactions in L or started after it that have no commit record.",
    checkPrompt:
      "T1 commits before the checkpoint, T2 commits after it, and T3 is still active at the crash. What does recovery do with each?",
    misconceptions: [
      {
        triggers: ["redo t1", "redo all committed", "redo everything"],
        label: "Redoes transactions that committed before the checkpoint",
        nudge: "The checkpoint flushed every modified block to disk. Is there anything of T1's left to redo?",
      },
      {
        triggers: ["checkpoint commits", "commits active", "saves the transaction as committed"],
        label: "Thinks a checkpoint commits active transactions",
        nudge: "A checkpoint just flushes and records a list. Does an active transaction in L get a <commit> record from it?",
      },
      {
        triggers: ["entire log", "whole log", "from the beginning"],
        label: "Thinks recovery still scans the entire log",
        nudge: "What does the <checkpoint> record guarantee about everything written before it?",
      },
    ],
  },
  {
    concept: C.indexing,
    aliases: [
      "Indexing",
      "Index",
      "Indexes",
      "Indices",
      "Ordered Indices",
      "Ordered Indexes",
      "Indexing and Hashing",
      "Basic Concepts of Indexing",
      "Dense Index",
      "Sparse Index",
      "Dense and Sparse Index",
      "Dense and Sparse Indices",
      "Primary Index",
      "Secondary Index",
      "Secondary Indices",
      "Clustering Index",
      "Multilevel Index",
      "Multilevel Indices",
      "Multi-level Indexing",
      "Single-Level Ordered Indexes",
      "Index Structures",
    ],
    keyIdeas: [
      "dense",
      "every search-key value",
      "sparse",
      "one entry per block",
      "file sorted on the search key",
      "primary index",
      "secondary index",
      "secondary must be dense",
      "multilevel",
    ],
    probe: "What's the difference between a dense and a sparse index, and when can you use a sparse one?",
    hint1: "Count index entries: does the index have one per search-key value, or one per data block?",
    hint2:
      "A sparse index points to blocks: to find a key you take the largest index entry ≤ the key and scan forward. What must be true about the file's order for that scan to work?",
    workedStep:
      "Dense: an index entry for every search-key value. Sparse: entries for only some values — typically one per data block, holding the block's first key. A sparse lookup finds the largest entry ≤ the key and scans that block, which only works if the file is sorted on the search key; so sparse indices are possible only as a primary (clustering) index. A secondary index, on a non-ordering attribute, must be dense.",
    checkPrompt: "Why must a secondary index be dense?",
    misconceptions: [
      {
        triggers: ["secondary can be sparse", "secondary index is sparse", "sparse secondary"],
        label: "Thinks a secondary index can be sparse",
        nudge: "The file isn't sorted on a secondary key. After jumping to a block, could a scan find all matching records nearby?",
      },
      {
        triggers: ["any file", "unsorted", "no need to be sorted", "not sorted"],
        label: "Thinks sparse indices work on unsorted files",
        nudge: "A sparse lookup stops at 'the largest entry ≤ key' and scans forward. Why would that fail on an unsorted file?",
      },
      {
        triggers: ["dense means primary", "sparse means secondary", "primary is dense"],
        label: "Confuses dense/sparse with primary/secondary",
        nudge: "Dense/sparse is about how many entries; primary/secondary is about the file's sort order. Can a primary index be dense?",
      },
    ],
  },
  {
    concept: C.bplus,
    aliases: [
      "B+ Tree",
      "B+-Tree",
      "B+-Trees",
      "B Plus Tree",
      "B Plus Trees",
      "B+ Tree Index Files",
      "B+-Tree Index Files",
      "B+ Tree Indexing",
      "B+ Tree Insertion and Deletion",
      "Tree-Structured Indexing",
      "Dynamic Multilevel Indexes",
    ],
    keyIdeas: [
      "leaf nodes",
      "record pointers only in leaves",
      "internal nodes guide search",
      "leaves linked",
      "range queries",
      "balanced",
      "fan-out",
      "split",
      "height",
    ],
    probe: "In a B+ tree, where are the pointers to the actual records stored, and why are the leaf nodes linked together?",
    hint1:
      "Compare with a B-tree, where a key and its record pointer can sit in any node. What does a B+ tree keep in its internal nodes instead?",
    hint2:
      "Internal nodes hold only separator keys and child pointers, as a routing index; every key appears in a leaf with its record pointer. Now take the query 'all keys between 20 and 50': after reaching 20, how do you get to the next leaf?",
    workedStep:
      "Every search key appears in a leaf together with its record pointer; internal nodes store only separator keys and child pointers. Leaves are linked left to right, so a range query descends once to the first key and then walks the leaf chain. The tree is balanced (all leaves at the same depth) and its height grows like log base fan-out of the number of keys, so a search over millions of keys reads only 3–4 blocks. Inserting into a full node splits it and pushes a separator key up to the parent.",
    checkPrompt: "Why do B+ trees have a much smaller height than binary search trees for disk-based data?",
    misconceptions: [
      {
        triggers: ["all nodes", "every node", "internal nodes store records", "like a b tree", "internal nodes have data"],
        label: "Thinks internal nodes store record pointers",
        nudge: "If internal nodes also held record pointers, how many separator keys would still fit in one block?",
      },
      {
        triggers: ["unbalanced", "different levels", "skewed"],
        label: "Thinks a B+ tree can become unbalanced",
        nudge: "A split pushes a key up to the parent and the tree only grows at the root. Can one leaf end up deeper than another?",
      },
      {
        triggers: ["order is height", "order means levels", "number of levels is the order"],
        label: "Confuses order (fan-out) with height",
        nudge: "Order bounds how many children ONE node may have. What does height count?",
      },
    ],
  },
  {
    concept: C.hashing,
    aliases: [
      "Hashing Techniques",
      "Hash Indexing",
      "Hash Index",
      "Hash Indices",
      "Hash-Based Indexing",
      "Hash Based Indexing",
      "Static Hashing",
      "Dynamic Hashing",
      "Static and Dynamic Hashing",
      "Extendible Hashing",
      "Extendable Hashing",
      "Linear Hashing",
      "Hash File Organization",
      "Bucket Overflow",
    ],
    keyIdeas: [
      "hash function",
      "bucket",
      "equality search",
      "no key order",
      "range needs every bucket",
      "overflow chain",
      "directory",
      "global depth",
      "local depth",
    ],
    probe:
      "Why is a hash index great for 'WHERE roll_no = 42' but poor for 'WHERE marks BETWEEN 60 AND 80'?",
    hint1: "What does the hash function do to the order of keys? Would 60, 61 and 62 land in neighbouring buckets?",
    hint2:
      "A good hash function scatters keys uniformly, destroying key order — so a range query must look in every bucket. And for an equality search, how many buckets do you need to read?",
    workedStep:
      "For equality, h(42) names exactly one bucket: read it (plus any overflow blocks) — typically one or two I/Os. Hashing scatters keys and keeps no key order, so a range query must examine every bucket, whereas a B+ tree descends once and scans its linked leaves. Static hashing has a fixed number of buckets and degrades into overflow chains as the file grows; extendible hashing uses a directory of 2^(global depth) pointers and splits only the overflowing bucket, doubling the directory only when that bucket's local depth equals the global depth.",
    checkPrompt: "In extendible hashing, when does the directory double, and when does a bucket split without doubling it?",
    misconceptions: [
      {
        triggers: ["good for range", "range queries are fast", "works for between", "supports range"],
        label: "Thinks hashing supports range queries efficiently",
        nudge: "Where do h(60) and h(61) land relative to each other? What would you have to read to find every key in 60..80?",
      },
      {
        triggers: ["always doubles", "doubles every time", "every split doubles"],
        label: "Thinks the directory doubles on every split",
        nudge: "A bucket with local depth 2 in a directory of global depth 3 has two directory entries pointing at it. Does it need a bigger directory to split?",
      },
      {
        triggers: ["local depth of the directory", "global depth of a bucket", "global depth is per bucket"],
        label: "Confuses global depth and local depth",
        nudge: "Which depth belongs to the whole directory, and which belongs to a single bucket?",
      },
    ],
  },
];

// ── Question bank ───────────────────────────────────────────────────────────
// Per concept: one diagnostic item (difficulty near 0, the most informative first probe)
// plus ≥ 2 practice/check items. Numeric answers are exact integers.

export const QUESTION_BANK: BankQuestion[] = [
  // DBMS Architecture
  {
    concept: C.architecture,
    type: "mcq",
    body: "Adding a new index on a table without changing the conceptual schema or any application is an example of:",
    options: [
      "Logical data independence",
      "Physical data independence",
      "Referential integrity",
      "Data abstraction at the view level",
    ],
    answer: "1",
    explanation:
      "An index belongs to the internal (physical) schema; shielding the conceptual schema from that change is physical data independence.",
    difficulty: -0.5,
    purposes: ["diagnostic"],
  },
  {
    concept: C.architecture,
    type: "mcq",
    body: "In the three-schema architecture, which level describes the whole database for all users — entities, relationships and constraints — while hiding physical storage details?",
    options: ["External level", "Conceptual level", "Internal level", "View level"],
    answer: "1",
    explanation: "The conceptual level is the community view of the entire database; storage details live at the internal level.",
    difficulty: -0.3,
    purposes: ["practice", "check"],
  },
  {
    concept: C.architecture,
    type: "mcq",
    body: "Which statement about data independence is correct?",
    options: [
      "Physical data independence is harder to achieve than logical data independence",
      "Logical data independence means changes to the conceptual schema do not require rewriting external schemas or application programs",
      "Data independence means data is stored independently of the DBMS software",
      "Logical data independence is provided by the internal level alone",
    ],
    answer: "1",
    explanation:
      "Logical data independence shields external views from conceptual changes. It is the harder of the two, because applications depend directly on the logical structure.",
    difficulty: 0.2,
    purposes: ["practice", "check"],
  },

  // ER Model
  {
    concept: C.er,
    type: "mcq",
    body: "A weak entity set is one that:",
    options: [
      "Has no attributes other than its key",
      "Cannot be uniquely identified by its own attributes and depends on an identifying (owner) entity set",
      "Participates only in one-to-one relationships",
      "Has only partial participation in every relationship",
    ],
    answer: "1",
    explanation:
      "A weak entity has only a partial key (discriminator); it is identified by combining that with the owner entity's key through an identifying relationship.",
    difficulty: -0.3,
    purposes: ["diagnostic"],
  },
  {
    concept: C.er,
    type: "mcq",
    body: "In an ER diagram, a double line connecting an entity set to a relationship set indicates:",
    options: [
      "The relationship is many-to-many",
      "Total participation of the entity set in the relationship",
      "The entity set is weak",
      "A derived attribute",
    ],
    answer: "1",
    explanation: "A double line means every entity in the set must take part in at least one relationship instance.",
    difficulty: 0,
    purposes: ["practice", "check"],
  },
  {
    concept: C.er,
    type: "mcq",
    body: "Each employee works in exactly one department, and a department can have many employees. The cardinality ratio Department : Employee for Works_In is:",
    options: ["1:1", "1:N", "M:N", "N:1"],
    answer: "1",
    explanation: "One department relates to many employees, and each employee to exactly one department: Department : Employee = 1 : N.",
    difficulty: 0.3,
    purposes: ["practice", "check"],
  },
  {
    concept: C.er,
    type: "mcq",
    body: "An attribute such as Age, which can be computed from DateOfBirth, is called a:",
    options: ["Composite attribute", "Multivalued attribute", "Derived attribute", "Key attribute"],
    answer: "2",
    explanation: "A derived attribute's value is computed from other stored attributes; it is drawn as a dashed ellipse.",
    difficulty: -0.4,
    purposes: ["practice"],
  },

  // ER to Relational Mapping
  {
    concept: C.erMapping,
    type: "numeric",
    body: "An ER diagram has two strong entity sets, Student and Course, connected by an M:N relationship Enrolls. Student also has a multivalued attribute PhoneNo. What is the minimum number of relational tables needed?",
    options: null,
    answer: "4",
    explanation:
      "Student, Course, a table for the M:N relationship Enrolls, and a separate table for the multivalued attribute PhoneNo: 4 tables.",
    difficulty: 0.2,
    purposes: ["diagnostic"],
  },
  {
    concept: C.erMapping,
    type: "mcq",
    body: "Department (1) and Employee (N) are related by a 1:N relationship Works_In. The standard relational mapping is to:",
    options: [
      "Create a separate table Works_In(dept_id, emp_id)",
      "Add dept_id as a foreign key in the Employee table",
      "Add emp_id as a foreign key in the Department table",
      "Merge Department and Employee into a single table",
    ],
    answer: "1",
    explanation: "For 1:N, the key of the '1' side goes into the 'N' side's table as a foreign key; no extra table is needed.",
    difficulty: -0.2,
    purposes: ["practice", "check"],
  },
  {
    concept: C.erMapping,
    type: "mcq",
    body: "A weak entity set Dependent (partial key dep_name) is owned by Employee (key emp_id). The primary key of the Dependent table is:",
    options: ["dep_name", "emp_id", "{emp_id, dep_name}", "A new surrogate key only"],
    answer: "2",
    explanation: "A weak entity's table is keyed by the owner's key plus its own partial key.",
    difficulty: 0.3,
    purposes: ["practice", "check"],
  },
  {
    concept: C.erMapping,
    type: "numeric",
    body: "An ER diagram has 3 strong entity sets A, B and C, a 1:N relationship between A and B, and an M:N relationship between B and C. There are no multivalued attributes. What is the minimum number of tables?",
    options: null,
    answer: "4",
    explanation: "One table per entity set (3); the 1:N relationship becomes a foreign key in B; the M:N relationship needs its own table: 4.",
    difficulty: 0.5,
    purposes: ["practice"],
  },

  // Relational Model
  {
    concept: C.relational,
    type: "mcq",
    body: "Which constraint states that no attribute of a primary key may be NULL?",
    options: ["Referential integrity", "Entity integrity", "Domain constraint", "Key constraint on foreign keys"],
    answer: "1",
    explanation: "Entity integrity: primary-key values identify tuples, so they can never be NULL.",
    difficulty: -0.6,
    purposes: ["diagnostic"],
  },
  {
    concept: C.relational,
    type: "mcq",
    body: "Which of the following is NOT a property of a relation in the relational model?",
    options: [
      "Tuples are unordered",
      "Each attribute value is atomic",
      "Duplicate tuples are allowed",
      "Each attribute has a domain",
    ],
    answer: "2",
    explanation: "A relation is a set of tuples, so it cannot contain duplicates.",
    difficulty: -0.2,
    purposes: ["practice", "check"],
  },
  {
    concept: C.relational,
    type: "mcq",
    body: "Employee(dept_id) references Department(dept_id). Which operation can directly violate referential integrity?",
    options: [
      "Inserting a Department row with a new dept_id",
      "Deleting an Employee row",
      "Deleting a Department row that some Employee rows still reference",
      "Updating an Employee's salary",
    ],
    answer: "2",
    explanation:
      "Removing a referenced Department leaves dangling foreign keys in Employee (unless the DBMS cascades, sets NULL or rejects the delete).",
    difficulty: 0.3,
    purposes: ["practice", "check"],
  },
  {
    concept: C.relational,
    type: "numeric",
    body: "The degree of a relation is its number of attributes. R has degree 4 and 6 tuples; S has degree 3 and 5 tuples. What is the degree of the Cartesian product R × S?",
    options: null,
    answer: "7",
    explanation: "R × S has all attributes of R and of S: 4 + 3 = 7. (Its cardinality would be 6 × 5 = 30.)",
    difficulty: 0.4,
    purposes: ["practice"],
  },

  // Keys
  {
    concept: C.keys,
    type: "mcq",
    body: "A candidate key is:",
    options: [
      "Any set of attributes that uniquely identifies a tuple",
      "A minimal super key — no proper subset of it is a super key",
      "The primary key of another relation",
      "Any attribute that has no NULL values",
    ],
    answer: "1",
    explanation: "Any identifying set is a super key; a candidate key is a super key with no redundant attribute.",
    difficulty: -0.3,
    purposes: ["diagnostic"],
  },
  {
    concept: C.keys,
    type: "numeric",
    body: "Relation R(A, B, C, D) has exactly one candidate key, {A}. How many super keys does R have?",
    options: null,
    answer: "8",
    explanation: "Every superset of {A} is a super key: A plus any subset of {B, C, D}, i.e. 2³ = 8.",
    difficulty: 0.4,
    purposes: ["practice", "check"],
  },
  {
    concept: C.keys,
    type: "numeric",
    body: "Relation R(A, B, C, D) has exactly two candidate keys, {A} and {B}. How many super keys does R have?",
    options: null,
    answer: "12",
    explanation:
      "Supersets of {A}: 2³ = 8. Supersets of {B}: 8. Supersets of both {A, B}: 2² = 4, counted twice. Total 8 + 8 − 4 = 12.",
    difficulty: 0.8,
    purposes: ["practice", "check"],
  },
  {
    concept: C.keys,
    type: "mcq",
    body: "Which statement about foreign keys is true?",
    options: [
      "A foreign key must be unique within its own relation",
      "A foreign key's values must match primary-key values of the referenced relation, or be NULL",
      "A relation can have at most one foreign key",
      "A foreign key must be part of the primary key",
    ],
    answer: "1",
    explanation: "Many rows can share a foreign-key value; each non-NULL value must exist as a key in the referenced relation.",
    difficulty: 0,
    purposes: ["practice"],
  },

  // Relational Algebra
  {
    concept: C.algebra,
    type: "mcq",
    body: "Which relational algebra operator selects a subset of COLUMNS from a relation?",
    options: ["Selection (σ)", "Projection (π)", "Cartesian product (×)", "Rename (ρ)"],
    answer: "1",
    explanation: "Projection keeps the listed attributes; selection filters tuples (rows).",
    difficulty: -0.4,
    purposes: ["diagnostic"],
  },
  {
    concept: C.algebra,
    type: "numeric",
    body: "Relation R has 5 tuples and relation S has 4 tuples, with no attributes in common. How many tuples are in R × S?",
    options: null,
    answer: "20",
    explanation: "The Cartesian product pairs every tuple of R with every tuple of S: 5 × 4 = 20.",
    difficulty: 0,
    purposes: ["practice", "check"],
  },
  {
    concept: C.algebra,
    type: "mcq",
    body: "Enrolled(student, course) records enrolments and Course(course) lists all courses. Which expression finds the students enrolled in EVERY course?",
    options: [
      "Enrolled ⋈ Course",
      "π_student(Enrolled) − π_student(Course)",
      "Enrolled ÷ Course",
      "σ_course=ALL(Enrolled)",
    ],
    answer: "2",
    explanation: "Division returns the students paired with every tuple of Course — the classic 'for all' query.",
    difficulty: 0.6,
    purposes: ["practice", "check"],
  },
  {
    concept: C.algebra,
    type: "numeric",
    body: "R(A, B) contains the tuples (1, x), (2, x) and (3, y). How many tuples are in π_B(R)?",
    options: null,
    answer: "2",
    explanation: "π_B gives {x, y}; projection is a set operation, so the duplicate x appears once.",
    difficulty: 0.6,
    purposes: ["practice"],
  },

  // SQL Queries
  {
    concept: C.sql,
    type: "mcq",
    body: "Which clause filters the groups formed by GROUP BY using an aggregate condition?",
    options: ["WHERE", "HAVING", "ORDER BY", "DISTINCT"],
    answer: "1",
    explanation: "WHERE filters rows before grouping; HAVING filters groups after aggregation.",
    difficulty: -0.2,
    purposes: ["diagnostic"],
  },
  {
    concept: C.sql,
    type: "numeric",
    body: "Table Emp has 6 rows, and the salary column is NULL in 2 of them. What does SELECT COUNT(salary) FROM Emp return?",
    options: null,
    answer: "4",
    explanation: "COUNT(column) ignores NULLs, so it counts the 4 non-NULL salaries (COUNT(*) would return 6).",
    difficulty: 0.3,
    purposes: ["practice", "check"],
  },
  {
    concept: C.sql,
    type: "mcq",
    body: "Which query lists each department that has more than 5 employees?",
    options: [
      "SELECT dept FROM Emp WHERE COUNT(*) > 5 GROUP BY dept",
      "SELECT dept FROM Emp GROUP BY dept HAVING COUNT(*) > 5",
      "SELECT dept, COUNT(*) > 5 FROM Emp",
      "SELECT dept FROM Emp HAVING dept > 5",
    ],
    answer: "1",
    explanation: "Group by dept, then keep groups whose COUNT(*) exceeds 5 with HAVING; aggregates are not allowed in WHERE.",
    difficulty: 0.4,
    purposes: ["practice", "check"],
  },
  {
    concept: C.sql,
    type: "mcq",
    body: "Which of these is a DDL (Data Definition Language) command?",
    options: ["INSERT", "UPDATE", "ALTER", "SELECT"],
    answer: "2",
    explanation: "ALTER changes a table's definition (DDL); INSERT, UPDATE and SELECT work on data (DML).",
    difficulty: -0.5,
    purposes: ["practice"],
  },

  // Joins & Nested Queries
  {
    concept: C.joins,
    type: "numeric",
    body: "Employee has 10 rows. 3 of them have a dept_id that matches no Department row; each of the others matches exactly one. How many rows does Employee LEFT OUTER JOIN Department return?",
    options: null,
    answer: "10",
    explanation: "Every Employee row appears once: 7 matched rows plus 3 unmatched rows padded with NULLs.",
    difficulty: 0.3,
    purposes: ["diagnostic"],
  },
  {
    concept: C.joins,
    type: "mcq",
    body: "Which join returns only the rows that have matching values in both tables?",
    options: ["LEFT OUTER JOIN", "FULL OUTER JOIN", "INNER JOIN", "CROSS JOIN"],
    answer: "2",
    explanation: "An inner join keeps only matching pairs; outer joins also keep unmatched rows, and a cross join pairs everything.",
    difficulty: 0,
    purposes: ["practice", "check"],
  },
  {
    concept: C.joins,
    type: "mcq",
    body: "A correlated subquery is one that:",
    options: [
      "Is written inside the FROM clause",
      "References a column of the outer query and is logically re-evaluated for each outer row",
      "Always returns exactly one row",
      "Can only be used with the IN operator",
    ],
    answer: "1",
    explanation: "Because it depends on the current outer row, a correlated subquery is (logically) evaluated once per outer row.",
    difficulty: 0.5,
    purposes: ["practice", "check"],
  },
  {
    concept: C.joins,
    type: "numeric",
    body: "Employee has 10 rows. 3 of them have a dept_id that matches no Department row; each of the others matches exactly one. How many rows does Employee INNER JOIN Department return?",
    options: null,
    answer: "7",
    explanation: "An inner join drops the 3 unmatched employees and returns the 7 matching pairs.",
    difficulty: 0.1,
    purposes: ["practice"],
  },

  // Functional Dependencies
  {
    concept: C.fd,
    type: "mcq",
    body: "Which of the following functional dependencies is trivial?",
    options: ["A → B", "AB → A", "A → AB", "B → A"],
    answer: "1",
    explanation: "X → Y is trivial when Y ⊆ X. {A} ⊆ {A, B}, so AB → A is trivial; A → AB is not, since B ∉ {A}.",
    difficulty: -0.2,
    purposes: ["diagnostic"],
  },
  {
    concept: C.fd,
    type: "mcq",
    body: "Given A → B and B → C, which Armstrong axiom yields A → C?",
    options: ["Reflexivity", "Augmentation", "Transitivity", "Decomposition"],
    answer: "2",
    explanation: "Transitivity: X → Y and Y → Z imply X → Z.",
    difficulty: 0,
    purposes: ["practice", "check"],
  },
  {
    concept: C.fd,
    type: "mcq",
    body: "Relation R(A, B, C) contains exactly the tuples (1, x, p), (1, x, q) and (2, y, p). Which functional dependency does this instance VIOLATE?",
    options: ["A → B", "A → C", "B → A", "C → C"],
    answer: "1",
    explanation:
      "The two tuples with A = 1 have different C values (p and q), so A → C fails. A → B and B → A hold here, and C → C is trivial.",
    difficulty: 0.5,
    purposes: ["practice", "check"],
  },
  {
    concept: C.fd,
    type: "mcq",
    body: "From A → B, the augmentation rule allows us to infer:",
    options: ["B → A", "AC → BC", "A → C", "AB → C"],
    answer: "1",
    explanation: "Augmentation: X → Y implies XZ → YZ for any Z; with Z = C this gives AC → BC.",
    difficulty: 0.3,
    purposes: ["practice"],
  },

  // Attribute Closure
  {
    concept: C.closure,
    type: "numeric",
    body: "R(A, B, C, D, E) with F = {A → B, B → C, CD → E}. How many attributes are in the closure A⁺ (count A itself)?",
    options: null,
    answer: "3",
    explanation: "A⁺ = {A} → add B (A → B) → add C (B → C) = {A, B, C}. CD → E can't fire without D, so |A⁺| = 3.",
    difficulty: 0.3,
    purposes: ["diagnostic"],
  },
  {
    concept: C.closure,
    type: "numeric",
    body: "R(A, B, C, D) with F = {AB → C, C → D, D → A}. How many candidate keys does R have?",
    options: null,
    answer: "3",
    explanation:
      "B is on no right-hand side, so every key contains B, and B⁺ = {B}. (AB)⁺, (BC)⁺ and (BD)⁺ each equal {A, B, C, D}, and none contains a smaller key. Candidate keys: AB, BC, BD — 3.",
    difficulty: 0.6,
    purposes: ["practice", "check"],
  },
  {
    concept: C.closure,
    type: "mcq",
    body: "R(A, B, C, D, E) with F = {A → BC, CD → E, B → D}. What is A⁺?",
    options: ["{A, B, C}", "{A, B, C, D}", "{A, B, C, D, E}", "{A, D, E}"],
    answer: "2",
    explanation: "A → BC gives {A, B, C}; B → D adds D; now CD → E fires and adds E: A⁺ = {A, B, C, D, E}.",
    difficulty: 0.2,
    purposes: ["practice", "check"],
  },
  {
    concept: C.closure,
    type: "mcq",
    body: "R(A, B, C, D) with F = {A → B, BC → D}. Which set is a candidate key of R?",
    options: ["A", "AC", "BC", "ABC"],
    answer: "1",
    explanation:
      "A and C are on no right-hand side, so both are in every key. (AC)⁺ = {A, C, B, D} = R, so AC is a candidate key. ABC is a super key but not minimal.",
    difficulty: 0.4,
    purposes: ["practice"],
  },

  // Normal Forms (1NF–3NF)
  {
    concept: C.normalForms,
    type: "mcq",
    body: "R(A, B, C, D) has candidate key {A, B} and FDs AB → C and A → D. What is the highest normal form R satisfies?",
    options: ["1NF", "2NF", "3NF", "BCNF"],
    answer: "0",
    explanation: "A → D is a partial dependency: A is a proper part of the key and D is non-prime. So R is in 1NF but not 2NF.",
    difficulty: 0.3,
    purposes: ["diagnostic"],
  },
  {
    concept: C.normalForms,
    type: "mcq",
    body: "R(A, B, C) has key A and FDs A → B and B → C. R is in:",
    options: ["1NF but not 2NF", "2NF but not 3NF", "3NF but not BCNF", "BCNF"],
    answer: "1",
    explanation:
      "With a single-attribute key there are no partial dependencies, so R is in 2NF. B → C is transitive (B is not a super key and C is non-prime), so R is not in 3NF.",
    difficulty: 0.2,
    purposes: ["practice", "check"],
  },
  {
    concept: C.normalForms,
    type: "mcq",
    body: "A relation is in 2NF if it is in 1NF and:",
    options: [
      "It has no multivalued attributes",
      "No non-prime attribute is partially dependent on any candidate key",
      "No non-prime attribute is transitively dependent on any candidate key",
      "Every determinant is a candidate key",
    ],
    answer: "1",
    explanation: "2NF removes partial dependencies; 3NF removes transitive ones; 'every determinant is a key' is BCNF.",
    difficulty: -0.3,
    purposes: ["practice", "check"],
  },
  {
    concept: C.normalForms,
    type: "mcq",
    body: "Course details are stored only inside the Enrollment table, so a new course cannot be recorded until some student enrols in it. This is a(n):",
    options: ["Deletion anomaly", "Insertion anomaly", "Update anomaly", "Join anomaly"],
    answer: "1",
    explanation: "Being unable to store a fact without an unrelated fact is an insertion anomaly; normalization removes it.",
    difficulty: 0,
    purposes: ["practice"],
  },

  // BCNF
  {
    concept: C.bcnf,
    type: "mcq",
    body: "R(A, B, C, D) with FDs AB → CD and C → A. What is the highest normal form of R?",
    options: ["1NF", "2NF", "3NF", "BCNF"],
    answer: "2",
    explanation:
      "Candidate keys are AB and BC, so A, B and C are prime. C → A violates BCNF (C is not a super key) but satisfies 3NF because A is prime. No partial or transitive dependency affects D.",
    difficulty: 0.6,
    purposes: ["diagnostic"],
  },
  {
    concept: C.bcnf,
    type: "mcq",
    body: "A relation R is in BCNF if, for every non-trivial functional dependency X → Y that holds on R:",
    options: [
      "Y is a prime attribute",
      "X is a super key of R",
      "X is a candidate key and Y is non-prime",
      "X and Y are disjoint",
    ],
    answer: "1",
    explanation: "BCNF: every determinant of a non-trivial FD must be a super key — with no exception for prime attributes.",
    difficulty: 0,
    purposes: ["practice", "check"],
  },
  {
    concept: C.bcnf,
    type: "mcq",
    body: "Which statement is TRUE?",
    options: [
      "Every 3NF relation is in BCNF",
      "Every BCNF relation is in 3NF",
      "BCNF decomposition always preserves dependencies",
      "A relation with a single candidate key can never be in BCNF",
    ],
    answer: "1",
    explanation: "BCNF is strictly stronger than 3NF, so every BCNF relation is in 3NF; BCNF decomposition may lose dependencies.",
    difficulty: 0.3,
    purposes: ["practice", "check"],
  },
  {
    concept: C.bcnf,
    type: "mcq",
    body: "R(Student, Course, Instructor) with FDs {Student, Course} → Instructor and Instructor → Course. R is:",
    options: ["Not in 3NF", "In 3NF but not in BCNF", "In BCNF", "Not even in 2NF"],
    answer: "1",
    explanation:
      "Keys are {Student, Course} and {Student, Instructor}, so every attribute is prime and 3NF holds. Instructor → Course violates BCNF because Instructor is not a super key.",
    difficulty: 0.5,
    purposes: ["practice"],
  },

  // Lossless-Join Decomposition
  {
    concept: C.lossless,
    type: "mcq",
    body: "R(A, B, C, D) with F = {A → B, C → D} is decomposed into R1(A, B) and R2(C, D). The decomposition is:",
    options: [
      "Lossless, because each FD lies inside one relation",
      "Lossy, because R1 and R2 have no common attribute",
      "Lossless, because R1 ∪ R2 = R",
      "Lossy, because it is not in BCNF",
    ],
    answer: "1",
    explanation: "R1 ∩ R2 = ∅ determines neither side, so joining R1 and R2 is a Cartesian product full of spurious tuples.",
    difficulty: 0.3,
    purposes: ["diagnostic"],
  },
  {
    concept: C.lossless,
    type: "mcq",
    body: "A decomposition of R into R1 and R2 is lossless if:",
    options: [
      "R1 ∪ R2 = R",
      "R1 ∩ R2 → R1 or R1 ∩ R2 → R2 is in F⁺",
      "R1 ∩ R2 = ∅",
      "Every FD of F holds in R1 or in R2",
    ],
    answer: "1",
    explanation: "The common attributes must be a super key of at least one of the two pieces.",
    difficulty: 0.2,
    purposes: ["practice", "check"],
  },
  {
    concept: C.lossless,
    type: "mcq",
    body: "R(A, B, C, D) with F = {A → B, B → C} is decomposed into R1(A, B, D) and R2(B, C). Is the decomposition lossless?",
    options: [
      "Lossless, since R1 ∩ R2 = {B} and B → C makes B a key of R2",
      "Lossy, since B is not a key of R",
      "Lossy, since D does not appear in R2",
      "It cannot be decided without the data",
    ],
    answer: "0",
    explanation: "R1 ∩ R2 = {B} and B⁺ = {B, C} ⊇ R2, so the common attribute is a key of R2: lossless.",
    difficulty: 0.5,
    purposes: ["practice", "check"],
  },
  {
    concept: C.lossless,
    type: "numeric",
    body: "R(A, B, C) contains the tuples (1, x, p) and (2, x, q). It is decomposed into R1(A, B) and R2(B, C). How many tuples does R1 ⋈ R2 contain?",
    options: null,
    answer: "4",
    explanation:
      "R1 = {(1, x), (2, x)}, R2 = {(x, p), (x, q)}; joining on B = x gives 2 × 2 = 4 tuples — 2 of them spurious.",
    difficulty: 0.4,
    purposes: ["practice"],
  },

  // Dependency Preservation
  {
    concept: C.depPreservation,
    type: "mcq",
    body: "R(A, B, C) with F = {A → B, B → C} is decomposed into R1(A, B) and R2(A, C). The decomposition is:",
    options: [
      "Lossless and dependency preserving",
      "Lossless but not dependency preserving",
      "Lossy but dependency preserving",
      "Lossy and not dependency preserving",
    ],
    answer: "1",
    explanation:
      "R1 ∩ R2 = {A} is a key of R1, so it is lossless. The projections give A → B and A → C, from which B → C cannot be derived: not dependency preserving.",
    difficulty: 0.3,
    purposes: ["diagnostic"],
  },
  {
    concept: C.depPreservation,
    type: "mcq",
    body: "A decomposition of R (with FDs F) into R1, …, Rn is dependency preserving if:",
    options: [
      "Every FD in F appears literally in some Ri",
      "(F1 ∪ … ∪ Fn)⁺ = F⁺, where Fi is the projection of F⁺ onto Ri",
      "R1 ⋈ … ⋈ Rn = R",
      "Each Ri is in BCNF",
    ],
    answer: "1",
    explanation:
      "The union of the projected dependencies must imply all of F. FDs need not appear literally; the join condition is losslessness.",
    difficulty: 0.1,
    purposes: ["practice", "check"],
  },
  {
    concept: C.depPreservation,
    type: "mcq",
    body: "Which property is guaranteed by the standard 3NF synthesis algorithm but NOT by BCNF decomposition?",
    options: ["Lossless join", "Dependency preservation", "Absence of all redundancy", "Fewer relations"],
    answer: "1",
    explanation: "Both algorithms give lossless decompositions; only 3NF synthesis also guarantees dependency preservation.",
    difficulty: 0.4,
    purposes: ["practice", "check"],
  },

  // ACID Properties
  {
    concept: C.acid,
    type: "mcq",
    body: "A system crash occurs midway through a funds transfer. Which property ensures the partial update is undone?",
    options: ["Atomicity", "Consistency", "Isolation", "Durability"],
    answer: "0",
    explanation: "Atomicity: a transaction's effects are all-or-nothing, so the recovery manager undoes the partial transfer.",
    difficulty: -0.5,
    purposes: ["diagnostic"],
  },
  {
    concept: C.acid,
    type: "mcq",
    body: "Which DBMS component is primarily responsible for ensuring isolation?",
    options: ["Recovery manager", "Concurrency-control manager", "Query optimizer", "Buffer manager"],
    answer: "1",
    explanation: "Isolation comes from concurrency control (locking, timestamps); atomicity and durability come from recovery.",
    difficulty: -0.1,
    purposes: ["practice", "check"],
  },
  {
    concept: C.acid,
    type: "mcq",
    body: "After executing its final statement but before it commits, a transaction is in which state?",
    options: ["Active", "Partially committed", "Committed", "Aborted"],
    answer: "1",
    explanation: "Active → partially committed (final statement done) → committed once its changes are safely recorded.",
    difficulty: 0.2,
    purposes: ["practice", "check"],
  },

  // Schedules
  {
    concept: C.schedules,
    type: "numeric",
    body: "How many different serial schedules are possible for 3 transactions T1, T2 and T3?",
    options: null,
    answer: "6",
    explanation: "A serial schedule is an ordering of whole transactions: 3! = 6.",
    difficulty: 0,
    purposes: ["diagnostic"],
  },
  {
    concept: C.schedules,
    type: "mcq",
    body: "T2 reads a value written by T1, and then T1 aborts. T2 has performed a:",
    options: ["Lost update", "Dirty read", "Unrepeatable read", "Phantom read"],
    answer: "1",
    explanation: "Reading a value written by a transaction that has not committed (and later aborts) is a dirty read.",
    difficulty: 0.1,
    purposes: ["practice", "check"],
  },
  {
    concept: C.schedules,
    type: "numeric",
    body: "T1 has 2 operations and T2 has 2 operations. How many distinct schedules (interleavings that keep each transaction's own operation order) are possible?",
    options: null,
    answer: "6",
    explanation: "Choose which 2 of the 4 positions hold T1's operations: C(4, 2) = 6.",
    difficulty: 0.6,
    purposes: ["practice", "check"],
  },
  {
    concept: C.schedules,
    type: "mcq",
    body: "In the schedule r1(X) r2(X) w1(X) w2(X), X is initially 100, T1 sets X = X + 50 and T2 sets X = X − 30. What is the final value of X?",
    options: ["120", "150", "70", "100"],
    answer: "2",
    explanation: "Both read 100; T1 writes 150, then T2 writes 100 − 30 = 70 from its stale read. T1's update is lost.",
    difficulty: 0,
    purposes: ["practice"],
  },

  // Conflict Serializability
  {
    concept: C.conflict,
    type: "mcq",
    body: "Which pair of operations CONFLICT?",
    options: ["r1(X) and r2(X)", "r1(X) and w2(Y)", "w1(X) and r2(X)", "w1(X) and w1(Y)"],
    answer: "2",
    explanation:
      "Operations conflict when they are in different transactions, touch the same item and at least one is a write: w1(X) and r2(X).",
    difficulty: 0.3,
    purposes: ["diagnostic"],
  },
  {
    concept: C.conflict,
    type: "mcq",
    body: "Schedule S: r1(A) w1(A) r2(A) w2(A) r1(B) w1(B). Is S conflict serializable?",
    options: [
      "Yes, it is equivalent to T1 followed by T2",
      "Yes, it is equivalent to T2 followed by T1",
      "No, the precedence graph has a cycle",
      "No, because T1 and T2 interleave",
    ],
    answer: "0",
    explanation:
      "Every conflict on A has T1's operation first (T1 → T2), and only T1 touches B. The graph is acyclic with the single edge T1 → T2.",
    difficulty: 0.2,
    purposes: ["practice", "check"],
  },
  {
    concept: C.conflict,
    type: "mcq",
    body: "Schedule S: r1(X) r2(Y) w2(X) w1(Y). Its precedence graph:",
    options: [
      "Has the single edge T1 → T2, so S is conflict serializable",
      "Has the single edge T2 → T1, so S is conflict serializable",
      "Has edges T1 → T2 and T2 → T1, so S is not conflict serializable",
      "Has no edges, so every serial order is equivalent",
    ],
    answer: "2",
    explanation: "r1(X) before w2(X) gives T1 → T2; r2(Y) before w1(Y) gives T2 → T1. The cycle means S is not conflict serializable.",
    difficulty: 0.6,
    purposes: ["practice", "check"],
  },
  {
    concept: C.conflict,
    type: "numeric",
    body: "The precedence graph of a schedule over T1, T2 and T3 has exactly one edge, T1 → T2. How many serial schedules are conflict equivalent to it?",
    options: null,
    answer: "3",
    explanation:
      "Every topological order works: T1 must precede T2 and T3 can go anywhere — T1 T2 T3, T1 T3 T2, T3 T1 T2. That is 3 of the 3! = 6 orders.",
    difficulty: 0.7,
    purposes: ["practice", "check"],
  },
  {
    concept: C.conflict,
    type: "mcq",
    body: "A schedule is conflict serializable if and only if:",
    options: [
      "Its precedence graph is acyclic",
      "It contains no blind writes",
      "Every transaction in it commits",
      "It is recoverable",
    ],
    answer: "0",
    explanation: "Acyclic precedence graph ⇔ conflict serializable; a topological order gives the equivalent serial schedule.",
    difficulty: 0,
    purposes: ["practice"],
  },

  // View Serializability
  {
    concept: C.view,
    type: "mcq",
    body: "Schedule S: r1(X) w2(X) w1(X) w3(X). Which statement is correct?",
    options: [
      "S is conflict serializable and view serializable",
      "S is view serializable but not conflict serializable",
      "S is conflict serializable but not view serializable",
      "S is neither conflict nor view serializable",
    ],
    answer: "1",
    explanation:
      "r1(X)–w2(X) gives T1 → T2 and w2(X)–w1(X) gives T2 → T1: a cycle. But S is view equivalent to T1 T2 T3 (T1 reads the initial X, T3 writes last), thanks to blind writes.",
    difficulty: 0.6,
    purposes: ["diagnostic"],
  },
  {
    concept: C.view,
    type: "mcq",
    body: "A schedule that is view serializable but not conflict serializable must contain:",
    options: ["A deadlock", "A blind write", "A cascading abort", "A read-only transaction"],
    answer: "1",
    explanation: "Without blind writes the two notions coincide; the extra view-serializable schedules all rely on blind writes.",
    difficulty: 0.3,
    purposes: ["practice", "check"],
  },
  {
    concept: C.view,
    type: "mcq",
    body: "Which relationship between the classes of schedules is correct?",
    options: [
      "Conflict serializable ⊂ view serializable",
      "View serializable ⊂ conflict serializable",
      "They are the same class",
      "They are disjoint",
    ],
    answer: "0",
    explanation: "Every conflict-serializable schedule is view serializable, but not every view-serializable schedule is conflict serializable.",
    difficulty: 0,
    purposes: ["practice", "check"],
  },

  // Recoverability
  {
    concept: C.recoverability,
    type: "mcq",
    body: "Schedule S: w1(X) r2(X) c2 c1. The schedule is:",
    options: ["Recoverable and cascadeless", "Recoverable but not cascadeless", "Not recoverable", "Strict"],
    answer: "2",
    explanation: "T2 reads from T1 but commits before T1. If T1 then aborts, committed T2 cannot be undone: not recoverable.",
    difficulty: 0.2,
    purposes: ["diagnostic"],
  },
  {
    concept: C.recoverability,
    type: "mcq",
    body: "Schedule S: w1(X) r2(X) c1 c2. The schedule is:",
    options: ["Recoverable and cascadeless", "Recoverable but not cascadeless", "Not recoverable", "Strict"],
    answer: "1",
    explanation:
      "T1 commits before T2, so S is recoverable; but T2 read X before T1 committed (a dirty read), so an abort of T1 would cascade.",
    difficulty: 0.4,
    purposes: ["practice", "check"],
  },
  {
    concept: C.recoverability,
    type: "mcq",
    body: "A schedule in which every transaction reads only values written by committed transactions is called:",
    options: ["Serial", "Cascadeless", "Conflict serializable", "Non-recoverable"],
    answer: "1",
    explanation: "Reading only committed data means no abort can force another transaction to roll back.",
    difficulty: 0,
    purposes: ["practice", "check"],
  },
  {
    concept: C.recoverability,
    type: "mcq",
    body: "Which inclusion between classes of schedules is correct?",
    options: [
      "Strict ⊂ Cascadeless ⊂ Recoverable",
      "Recoverable ⊂ Cascadeless ⊂ Strict",
      "Cascadeless ⊂ Strict ⊂ Recoverable",
      "Strict ⊂ Recoverable ⊂ Cascadeless",
    ],
    answer: "0",
    explanation: "Every strict schedule is cascadeless, and every cascadeless schedule is recoverable.",
    difficulty: 0.6,
    purposes: ["practice", "check"],
  },

  // Two-Phase Locking
  {
    concept: C.twoPL,
    type: "mcq",
    body: "Under the two-phase locking protocol, a transaction:",
    options: [
      "May acquire a new lock after releasing one, as long as it is a shared lock",
      "Cannot acquire any lock after it has released any lock",
      "Must release all its locks before it reads any data",
      "Must acquire all its locks before the transaction starts",
    ],
    answer: "1",
    explanation:
      "Growing phase (acquire only) then shrinking phase (release only). Acquiring everything up front is conservative 2PL, which basic 2PL does not require.",
    difficulty: 0.2,
    purposes: ["diagnostic"],
  },
  {
    concept: C.twoPL,
    type: "mcq",
    body: "Which statement about basic two-phase locking is TRUE?",
    options: [
      "It guarantees conflict serializability",
      "It prevents deadlocks",
      "It prevents cascading rollbacks",
      "It allows lock acquisition in the shrinking phase",
    ],
    answer: "0",
    explanation: "Ordering transactions by lock point gives an equivalent serial order; deadlocks and cascading rollbacks remain possible.",
    difficulty: 0.3,
    purposes: ["practice", "check"],
  },
  {
    concept: C.twoPL,
    type: "mcq",
    body: "Strict two-phase locking differs from basic 2PL in that:",
    options: [
      "All locks are acquired before the transaction starts",
      "Exclusive locks are held until the transaction commits or aborts",
      "Shared locks are never released",
      "Locks are released during the growing phase",
    ],
    answer: "1",
    explanation: "Holding exclusive locks until commit means no one reads uncommitted data, so there are no cascading rollbacks.",
    difficulty: 0.5,
    purposes: ["practice", "check"],
  },
  {
    concept: C.twoPL,
    type: "mcq",
    body: "In the lock-compatibility matrix, which pair of lock modes on the same item, held by different transactions, is compatible?",
    options: ["Shared–Shared", "Shared–Exclusive", "Exclusive–Shared", "Exclusive–Exclusive"],
    answer: "0",
    explanation: "Many transactions may read an item together; any exclusive (write) lock conflicts with every other lock.",
    difficulty: -0.4,
    purposes: ["practice"],
  },

  // Deadlocks
  {
    concept: C.deadlocks,
    type: "mcq",
    body: "A deadlock exists among transactions if and only if the wait-for graph:",
    options: ["Has at least one edge", "Contains a cycle", "Is a tree", "Has a node with no outgoing edges"],
    answer: "1",
    explanation: "A cycle means every transaction in it waits for the next one, so none can proceed.",
    difficulty: 0,
    purposes: ["diagnostic"],
  },
  {
    concept: C.deadlocks,
    type: "mcq",
    body: "In the wait-die scheme, an OLDER transaction requests a lock held by a YOUNGER transaction. The older transaction:",
    options: [
      "Is rolled back (dies)",
      "Waits",
      "Wounds (aborts) the younger transaction",
      "Is granted the lock immediately",
    ],
    answer: "1",
    explanation: "Wait-die: an older requester waits; a younger requester dies (is rolled back and restarted with its old timestamp).",
    difficulty: 0.5,
    purposes: ["practice", "check"],
  },
  {
    concept: C.deadlocks,
    type: "mcq",
    body: "In the wound-wait scheme, an OLDER transaction requests a lock held by a YOUNGER transaction. What happens?",
    options: [
      "The older transaction waits",
      "The older transaction is rolled back",
      "The younger transaction is rolled back (wounded)",
      "Both transactions are rolled back",
    ],
    answer: "2",
    explanation: "Wound-wait: an older requester wounds (preempts) the younger holder; a younger requester waits.",
    difficulty: 0.6,
    purposes: ["practice", "check"],
  },
  {
    concept: C.deadlocks,
    type: "numeric",
    body: "A wait-for graph has the edges T1 → T2, T2 → T3, T3 → T1 and T4 → T1. What is the minimum number of transactions that must be rolled back to break every deadlock?",
    options: null,
    answer: "1",
    explanation: "There is a single cycle, T1 → T2 → T3 → T1; rolling back any one of its members breaks it. T4 is only waiting.",
    difficulty: 0.3,
    purposes: ["practice"],
  },

  // Timestamp Ordering
  {
    concept: C.timestamp,
    type: "mcq",
    body: "Basic timestamp ordering: T (TS = 5) issues write(X), where R-TS(X) = 8 and W-TS(X) = 3. The protocol:",
    options: [
      "Performs the write and sets W-TS(X) = 5",
      "Rolls back T",
      "Makes T wait until the transaction with TS 8 commits",
      "Ignores the write (Thomas' write rule)",
    ],
    answer: "1",
    explanation:
      "TS(T) = 5 < R-TS(X) = 8: a younger transaction has already read X, so T's write is too late and T is rolled back. Thomas' rule only covers TS(T) < W-TS(X).",
    difficulty: 0.4,
    purposes: ["diagnostic"],
  },
  {
    concept: C.timestamp,
    type: "mcq",
    body: "With Thomas' write rule, T (TS = 10) issues write(X), where R-TS(X) = 7 and W-TS(X) = 12. The protocol:",
    options: [
      "Rolls back T",
      "Ignores the write and lets T continue",
      "Performs the write and sets W-TS(X) = 10",
      "Makes T wait",
    ],
    answer: "1",
    explanation: "TS(T) ≥ R-TS(X), so no younger transaction read X; TS(T) < W-TS(X), so the write is obsolete and is simply skipped.",
    difficulty: 0.6,
    purposes: ["practice", "check"],
  },
  {
    concept: C.timestamp,
    type: "mcq",
    body: "Why is the basic timestamp-ordering protocol free from deadlock?",
    options: [
      "It locks all items in advance",
      "No transaction ever waits; a conflicting operation causes a rollback instead",
      "It always aborts the older transaction",
      "It uses a wait-for graph",
    ],
    answer: "1",
    explanation: "Deadlock needs waiting; timestamp ordering never makes a transaction wait.",
    difficulty: 0.1,
    purposes: ["practice", "check"],
  },
  {
    concept: C.timestamp,
    type: "numeric",
    body: "Basic timestamp ordering: T with TS = 15 reads X, where R-TS(X) = 9 and W-TS(X) = 12. The read succeeds. What is R-TS(X) afterwards?",
    options: null,
    answer: "15",
    explanation: "TS(T) = 15 ≥ W-TS(X) = 12, so the read is allowed and R-TS(X) = max(9, 15) = 15.",
    difficulty: 0.3,
    purposes: ["practice"],
  },

  // Log-Based Recovery
  {
    concept: C.logRecovery,
    type: "mcq",
    body: "Immediate modification. The log at crash time is: <T1 start>, <T1, A, 100, 50>, <T1 commit>, <T2 start>, <T2, B, 200, 300>. Recovery must:",
    options: ["Undo T1 and redo T2", "Redo T1 and undo T2", "Redo both T1 and T2", "Undo both T1 and T2"],
    answer: "1",
    explanation: "T1 committed, so it is redone (A = 50); T2 has no commit record, so it is undone (B back to 200).",
    difficulty: 0.2,
    purposes: ["diagnostic"],
  },
  {
    concept: C.logRecovery,
    type: "mcq",
    body: "The write-ahead logging (WAL) rule requires that:",
    options: [
      "Data pages are written to disk before their log records",
      "The log record for an update reaches stable storage before the updated data item is written to disk",
      "The log is written only at checkpoints",
      "A transaction writes its log records only at commit",
    ],
    answer: "1",
    explanation: "Logging first guarantees that any change on disk can be undone (and every committed change redone) after a crash.",
    difficulty: 0,
    purposes: ["practice", "check"],
  },
  {
    concept: C.logRecovery,
    type: "numeric",
    body: "Immediate modification. The log at crash time is: <T1 start>, <T1, X, 10, 20>, <T1 commit>, <T2 start>, <T2, X, 20, 30>. What is the value of X after recovery completes?",
    options: null,
    answer: "20",
    explanation: "Redo T1 (X = 20) and undo the uncommitted T2, restoring its old value 20. Final X = 20.",
    difficulty: 0.5,
    purposes: ["practice", "check"],
  },
  {
    concept: C.logRecovery,
    type: "mcq",
    body: "In the deferred database-modification scheme, update log records need to store:",
    options: [
      "Only the old value of each updated item",
      "Only the new value of each updated item",
      "Both the old and the new value",
      "Neither; only commit records are logged",
    ],
    answer: "1",
    explanation: "Nothing reaches the database before commit, so recovery never undoes; it only redoes, which needs just the new value.",
    difficulty: 0.3,
    purposes: ["practice"],
  },

  // Checkpoints
  {
    concept: C.checkpoints,
    type: "mcq",
    body: "T1 commits before the last checkpoint; T2 starts before the checkpoint and commits after it; T3 starts after the checkpoint and has no commit record at the crash. Recovery will:",
    options: [
      "Redo T1 and T2; undo T3",
      "Ignore T1, redo T2 and undo T3",
      "Ignore T1, undo T2 and T3",
      "Redo T1, T2 and T3",
    ],
    answer: "1",
    explanation: "T1's changes were flushed at the checkpoint; T2 committed later, so redo it; T3 never committed, so undo it.",
    difficulty: 0,
    purposes: ["diagnostic"],
  },
  {
    concept: C.checkpoints,
    type: "mcq",
    body: "The main purpose of checkpoints is to:",
    options: [
      "Commit long-running transactions early",
      "Reduce the portion of the log that must be scanned and redone after a crash",
      "Prevent deadlocks",
      "Replace the need for a log",
    ],
    answer: "1",
    explanation: "Everything before a checkpoint is already on disk, so recovery starts from the last checkpoint instead of the log's beginning.",
    difficulty: -0.2,
    purposes: ["practice", "check"],
  },
  {
    concept: C.checkpoints,
    type: "numeric",
    body: "At a crash the log mentions 6 transactions: T1 and T2 committed before the last checkpoint, T3 and T4 committed after it, and T5 and T6 have no commit record. How many transactions must be REDONE?",
    options: null,
    answer: "2",
    explanation: "Only T3 and T4 (committed after the checkpoint) are redone; T1 and T2 are already on disk; T5 and T6 are undone.",
    difficulty: 0.4,
    purposes: ["practice", "check"],
  },

  // Indexing Basics
  {
    concept: C.indexing,
    type: "mcq",
    body: "A sparse index can be built only when:",
    options: [
      "The file is sorted on the search key",
      "The search key is not a candidate key",
      "The index is a secondary index",
      "The file is organised by hashing",
    ],
    answer: "0",
    explanation: "Sparse lookup finds the largest entry ≤ key and scans forward, which only works when the file is ordered on that key.",
    difficulty: 0,
    purposes: ["diagnostic"],
  },
  {
    concept: C.indexing,
    type: "numeric",
    body: "A data file has 30,000 records, 10 records per block, sorted on the key. A sparse primary index has one entry per data block, and 100 index entries fit in a block. How many blocks does the single-level index occupy?",
    options: null,
    answer: "30",
    explanation: "30,000 / 10 = 3,000 data blocks → 3,000 index entries → 3,000 / 100 = 30 index blocks.",
    difficulty: 0.5,
    purposes: ["practice", "check"],
  },
  {
    concept: C.indexing,
    type: "mcq",
    body: "A secondary index on a non-ordering attribute must be:",
    options: ["Sparse", "Dense", "Clustered", "Hashed"],
    answer: "1",
    explanation: "The file isn't sorted on a secondary key, so every search-key value needs its own index entry.",
    difficulty: 0.2,
    purposes: ["practice", "check"],
  },
  {
    concept: C.indexing,
    type: "numeric",
    body: "The same file (30,000 records, 10 records per block) gets a DENSE index with one entry per record, 100 entries per index block. How many index blocks are needed?",
    options: null,
    answer: "300",
    explanation: "30,000 index entries / 100 per block = 300 index blocks — ten times the sparse index.",
    difficulty: 0.6,
    purposes: ["practice"],
  },

  // B+ Trees
  {
    concept: C.bplus,
    type: "mcq",
    body: "In a B+ tree index, pointers to the data records are stored:",
    options: ["In every node", "Only in internal nodes", "Only in leaf nodes", "Only in the root"],
    answer: "2",
    explanation: "Internal nodes hold only separator keys and child pointers; every key appears in a leaf with its record pointer.",
    difficulty: 0.2,
    purposes: ["diagnostic"],
  },
  {
    concept: C.bplus,
    type: "numeric",
    body: "A B+ tree node is one 4096-byte block. A search key takes 10 bytes and a pointer 6 bytes, and an internal node with n pointers holds n − 1 keys. What is the maximum fan-out n?",
    options: null,
    answer: "256",
    explanation: "6n + 10(n − 1) ≤ 4096 → 16n ≤ 4106 → n ≤ 256.6, so n = 256 (256 pointers and 255 keys use 4086 bytes).",
    difficulty: 0.6,
    purposes: ["practice", "check"],
  },
  {
    concept: C.bplus,
    type: "numeric",
    body: "Every B+ tree node, root included, has fan-out 100, and each leaf holds 100 keys. What is the minimum height (number of levels, counting the root and the leaves) needed to index 1,000,000 keys?",
    options: null,
    answer: "3",
    explanation: "1,000,000 keys need 10,000 leaves. Two levels reach only 100 leaves (10,000 keys); three levels reach 100 × 100 = 10,000 leaves.",
    difficulty: 0.8,
    purposes: ["practice", "check"],
  },
  {
    concept: C.bplus,
    type: "mcq",
    body: "Why are the leaf nodes of a B+ tree linked in sequence?",
    options: [
      "To keep the tree balanced during insertion",
      "To answer range queries efficiently by scanning leaves in key order",
      "To store duplicate keys in the internal nodes",
      "To avoid node splits",
    ],
    answer: "1",
    explanation: "A range query descends once to the first key, then follows the leaf links instead of re-searching from the root.",
    difficulty: 0.3,
    purposes: ["practice", "check"],
  },
  {
    concept: C.bplus,
    type: "mcq",
    body: "Compared with a B-tree of the same order, a B+ tree:",
    options: [
      "Stores record pointers in its internal nodes",
      "Keeps every key in the leaves, which are linked for sequential access",
      "Cannot be used for range queries",
      "Is not height-balanced",
    ],
    answer: "1",
    explanation: "B+ trees push all keys (with record pointers) to linked leaves; internal nodes only route the search.",
    difficulty: 0,
    purposes: ["practice"],
  },

  // Hashing
  {
    concept: C.hashing,
    type: "mcq",
    body: "Hash indices are best suited for:",
    options: [
      "Range queries such as marks BETWEEN 60 AND 80",
      "Equality searches such as roll_no = 42",
      "Returning rows in sorted order",
      "Prefix searches such as name LIKE 'Ra%'",
    ],
    answer: "1",
    explanation: "Hashing jumps straight to one bucket for an exact key, but scatters keys, so it keeps no order for ranges or prefixes.",
    difficulty: -0.2,
    purposes: ["diagnostic"],
  },
  {
    concept: C.hashing,
    type: "numeric",
    body: "In extendible hashing, the global depth is 3. How many entries does the directory have?",
    options: null,
    answer: "8",
    explanation: "The directory has 2^(global depth) = 2³ = 8 entries.",
    difficulty: 0.4,
    purposes: ["practice", "check"],
  },
  {
    concept: C.hashing,
    type: "mcq",
    body: "In extendible hashing, a bucket with local depth 2 overflows while the global depth is 3. What happens?",
    options: [
      "The directory doubles and the global depth becomes 4",
      "The bucket splits and its local depth becomes 3; the directory does not double",
      "An overflow chain is added and nothing else changes",
      "All buckets are rehashed with a new hash function",
    ],
    answer: "1",
    explanation:
      "Local depth < global depth means two directory entries already point to the bucket, so it can split without doubling the directory.",
    difficulty: 0.6,
    purposes: ["practice", "check"],
  },
  {
    concept: C.hashing,
    type: "numeric",
    body: "Static hashing uses h(k) = k mod 7 with buckets 0–6. Into which bucket does key 45 go?",
    options: null,
    answer: "3",
    explanation: "45 = 6 × 7 + 3, so 45 mod 7 = 3.",
    difficulty: 0,
    purposes: ["practice"],
  },
];

/**
 * Known prerequisite map for demo-subject concepts (canonical names):
 * concept → its direct prerequisites. Offline syllabus parsing uses it to infer edges
 * when extracted concept names match (via findTutorScript canonicalisation).
 */
export const CONCEPT_PREREQS: Record<string, string[]> = {
  [C.architecture]: [],
  [C.er]: [C.architecture],
  [C.erMapping]: [C.er, C.relational],
  [C.relational]: [C.architecture],
  [C.keys]: [C.relational],
  [C.algebra]: [C.relational],
  [C.sql]: [C.algebra],
  [C.joins]: [C.sql],
  [C.fd]: [C.keys],
  [C.closure]: [C.fd],
  [C.normalForms]: [C.closure],
  [C.bcnf]: [C.normalForms, C.lossless],
  [C.lossless]: [C.closure],
  [C.depPreservation]: [C.lossless],
  [C.acid]: [],
  [C.schedules]: [C.acid],
  [C.conflict]: [C.schedules],
  [C.view]: [C.conflict],
  [C.recoverability]: [C.conflict],
  [C.twoPL]: [C.conflict],
  [C.deadlocks]: [C.twoPL],
  [C.timestamp]: [C.conflict],
  [C.logRecovery]: [C.acid],
  [C.checkpoints]: [C.logRecovery],
  [C.indexing]: [],
  [C.bplus]: [C.indexing],
  [C.hashing]: [C.indexing],
};

/** Case-insensitive match on canonical name or alias. */
export function findTutorScript(conceptName: string): TutorScript | null {
  const n = conceptName.trim().toLowerCase();
  return (
    TUTOR_SCRIPTS.find(
      (s) => s.concept.toLowerCase() === n || s.aliases.some((a) => a.toLowerCase() === n),
    ) ?? null
  );
}

export function findBankQuestions(
  conceptName: string,
  purpose?: "diagnostic" | "practice" | "check",
): BankQuestion[] {
  const n = conceptName.trim().toLowerCase();
  const script = findTutorScript(conceptName);
  const names = new Set([
    n,
    ...(script ? [script.concept.toLowerCase(), ...script.aliases.map((a) => a.toLowerCase())] : []),
  ]);
  return QUESTION_BANK.filter(
    (q) => names.has(q.concept.toLowerCase()) && (!purpose || q.purposes.includes(purpose)),
  );
}
