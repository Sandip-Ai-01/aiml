/* =====================================================================
   SISTec Online Examination Portal  -  questions.js
   ---------------------------------------------------------------------
   Edit this file to change the exam settings and the questions.

   HOW TO EDIT
   • Exam time        -> change EXAM_CONFIG.duration (hours / minutes / seconds)
   • Add an MCQ       -> add a line:  mcq("Question text", ["A","B","C","D"], correctIndex, marks);
                         correctIndex is 0 for option A, 1 for B, 2 for C, 3 for D.
                         marks is optional (default 1).
   • Add a theory Q   -> add a line:  theory("Question text", marks);   (marks default 5)
   • Inline code      -> wrap code in `backticks`, e.g. "What does `cout << x;` do?"
   • Question ids (M1, M2 ... / T1, T2 ...) are generated automatically.
   ===================================================================== */

window.EXAM_CONFIG = {
  portalTitle: "Online Examination Portal",
  defaultSubject: "Object Oriented Programming with C++",
  defaultTestName: "Unit Test - C++ Fundamentals & Classes",

  // Examination duration
  duration: { hours: 2, minutes: 0, seconds: 0 },

  // Warning thresholds (in seconds)
  warnAtSeconds: 300,   // "5 minutes remaining" warning
  urgentAtSeconds: 60,  // "1 minute remaining" urgent warning

  // Photo upload rules for theory answers
  maxFileSizeMB: 8,
  maxPhotosPerQuestion: 10,

  // Marks deducted for each wrong MCQ (0 = no negative marking)
  negativeMarks: 0
};

window.QUESTIONS = [];

(function () {
  var list = window.QUESTIONS;
  var m = 0, t = 0;

  function mcq(text, options, correct, marks) {
    m++;
    list.push({ id: "M" + m, type: "mcq", marks: marks || 1, text: text, options: options, correct: correct });
  }
  function theory(text, marks) {
    t++;
    list.push({ id: "T" + t, type: "theory", marks: marks || 5, text: text });
  }

  /* ---------------- SECTION A : MCQs (50 x 1 mark) ---------------- */

  /* Tokens */
  mcq("Which of the following is NOT a token in C++?", ["Keyword", "Identifier", "Comment", "Operator"], 2);
  mcq("The smallest individual unit of a C++ program that is meaningful to the compiler is called a:", ["Statement", "Token", "Block", "Function"], 1);
  mcq("Which of the following is a valid C++ identifier?", ["2count", "my-var", "_total", "float"], 2);
  mcq("Which of the following is a keyword in C++?", ["cout", "printf", "include", "class"], 3);

  /* Precedence and associativity */
  mcq("Which of the following has the highest precedence in C++?", ["+ (addition)", ":: (scope resolution)", "= (assignment)", "&& (logical AND)"], 1);
  mcq("What is the associativity of the assignment operator (`=`) in C++?", ["Left to right", "Right to left", "No associativity", "Depends on the compiler"], 1);
  mcq("What is the value of the expression `10 + 5 * 2` ?", ["30", "25", "15", "20"], 3);
  mcq("What is the value of the expression `20 / 5 * 2` ?", ["2", "8", "10", "4"], 1);

  /* Program structure */
  mcq("Execution of every C++ program begins from the:", ["Header file", "Constructor", "Global variable", "main() function"], 3);
  mcq("Which header file is required to use `cout` and `cin`?", ["<stdio.h>", "<conio.h>", "<iostream>", "<string>"], 2);
  mcq("What is the purpose of the statement `using namespace std;` ?", ["It lets us use names from the std namespace without writing the std:: prefix", "It includes the iostream header file", "It declares the main function", "It creates a new class named std"], 0);

  /* Data types */
  mcq("What is the typical size of an `int` on a modern 32-bit / 64-bit compiler?", ["2 bytes", "4 bytes", "8 bytes", "1 byte"], 1);
  mcq("Which data type is used to store only true or false values?", ["int", "char", "void", "bool"], 3);
  mcq("The value of `sizeof(char)` in C++ is always:", ["1 byte", "2 bytes", "4 bytes", "Compiler dependent"], 0);

  /* Variables */
  mcq("Which keyword is used to declare a variable whose value cannot be changed after initialization?", ["static", "volatile", "extern", "const"], 3);
  mcq("What is the value of an uninitialized local variable of type `int`?", ["0", "A garbage (indeterminate) value", "1", "NULL"], 1);
  mcq("Which of the following is a correct way to declare three integer variables?", ["int a b c;", "integer a, b, c;", "int a, b, c;", "int a; b; c;"], 2);

  /* Operators and expressions */
  mcq("What is the result of `17 % 5` in C++?", ["3", "2", "0", "4"], 1);
  mcq("What is the value of `7 / 2` when both operands are integers?", ["3.5", "4", "3", "2"], 2);
  mcq("After `int a = 5; int b = a++;` what are the values of a and b?", ["a = 5, b = 5", "a = 6, b = 5", "a = 6, b = 6", "a = 5, b = 6"], 1);
  mcq("After `int a = 5; int b = ++a;` what is the value of b?", ["5", "7", "4", "6"], 3);
  mcq("Which operator is the logical AND operator in C++?", ["&", "||", "&&", "!"], 2);
  mcq("Which is the conditional (ternary) operator in C++?", ["?:", "::", "->", "<<"], 0);
  mcq("In an arithmetic expression containing an `int` and a `float` operand, the result is of type:", ["int", "float", "char", "bool"], 1);
  mcq("Which operator gives the size of a variable or data type in bytes?", ["length", "size()", "sizeof", "count"], 2);

  /* Statements and control structures */
  mcq("Which of the following is a selection (decision-making) statement?", ["for", "while", "do-while", "if-else"], 3);
  mcq("Which loop is guaranteed to execute its body at least once?", ["do-while", "while", "for", "None of these"], 0);
  mcq("What happens in a `switch` statement if `break` is omitted after a matching case?", ["Compile-time error", "Execution falls through to the next case", "The program terminates", "The switch restarts"], 1);
  mcq("Which statement skips the rest of the current loop iteration and moves on to the next iteration?", ["break", "continue", "exit", "return"], 1);
  mcq("What is the output of: `for (int i = 0; i < 3; i++) cout << i;`", ["123", "012", "0123", "321"], 1);

  /* I/O operations */
  mcq("Which operator is used with `cin` to read input from the keyboard?", ["<<", "::", ">>", "->"], 2);
  mcq("Which manipulator inserts a newline and flushes the output buffer?", ["endl", "setw", "ends", "setprecision"], 0);
  mcq("Which statement reads a complete line (including spaces) into a `string s` ?", ["cin >> s;", "getline(cin, s);", "cout << s;", "scanf(s);"], 1);

  /* Arrays */
  mcq("For the declaration `int a[5];` what is the valid range of indices?", ["1 to 5", "0 to 5", "0 to 4", "1 to 4"], 2);
  mcq("Which of the following is the correct declaration of an integer array of 10 elements?", ["int a(10);", "int a[10];", "int[10] a;", "array a = 10;"], 1);
  mcq("If `int a[] = {10, 20, 30, 40};` what is the value of `a[2]` ?", ["20", "40", "10", "30"], 3);

  /* Functions */
  mcq("Which return type is used for a function that does not return any value?", ["null", "int", "void", "empty"], 2);
  mcq("Which symbol is used in a parameter list to declare a reference parameter (call by reference)?", ["*", "#", "@", "&"], 3);
  mcq("Function overloading means having functions with:", ["The same name and the same parameters", "The same name but different parameter lists", "Different names but the same parameters", "The same name that differ only in return type"], 1);
  mcq("In a function that uses default arguments, the default values must be given:", ["From right to left in the parameter list", "From left to right in the parameter list", "In any order", "Only for the first parameter"], 0);

  /* UNIT III : Classes and objects */
  mcq("What is the default access specifier for the members of a class in C++?", ["public", "protected", "private", "internal"], 2);
  mcq("An object is best described as:", ["A blueprint of a class", "An instance of a class", "A function inside a class", "A header file"], 1);
  mcq("If `p` is a pointer to an object, how is its member function `show()` called?", ["p.show()", "p::show()", "p=>show()", "p->show()"], 3);

  /* Scope resolution operator */
  mcq("Which symbol represents the scope resolution operator in C++?", ["->", ".", "::", ":"], 2);
  mcq("Which is the correct way to define the member function `display()` of class `Student` outside the class?", ["void Student.display() { }", "void Student::display() { }", "void display::Student() { }", "void Student->display() { }"], 1);
  mcq("A global variable `x` is hidden by a local variable `x`. How can the global variable be accessed inside the function?", ["::x", "global::x", "this->x", "&x"], 0);

  /* Constructors and destructors */
  mcq("Which statement about a constructor is correct?", ["It has return type void", "It must always be declared private", "Its name starts with a tilde (~)", "It has the same name as the class and no return type"], 3);
  mcq("When is a constructor called?", ["Automatically when an object is created", "When an object is destroyed", "When the class is defined", "Only when the programmer calls it explicitly"], 0);
  mcq("Which is the correct name of the destructor for a class named `Test`?", ["Test()", "~Test()", "!Test()", "delete Test()"], 1);
  mcq("Which statement about destructors is TRUE?", ["A destructor can be overloaded", "A destructor can take parameters", "A class can have only one destructor and it takes no parameters", "A destructor can return a value"], 2);

  /* ---------------- SECTION B : Theory (10 x 5 marks) ---------------- */
  /* Students answer these by uploading photos of handwritten pages. */

  theory("What are tokens in C++? Explain the different types of tokens (keywords, identifiers, literals/constants, operators and punctuators) with one example of each.");
  theory("Explain operator precedence and associativity in C++. Evaluate the expression `5 + 3 * 2 - 4 / 2` step by step and state the associativity of the `=` operator.");
  theory("Explain the basic structure of a C++ program. Write a simple program that prints \"Hello, SISTec\" and explain each line of it.");
  theory("List the fundamental (built-in) data types of C++ with their typical sizes and one example each. What is a variable? Show how variables are declared and initialized.");
  theory("Write the syntax and a short example of the `if-else` statement and of any two looping statements (`for`, `while`, `do-while`) in C++.");
  theory("Explain input and output operations in C++ using `cin` and `cout`. Write a program that reads two numbers and displays their sum.");
  theory("What is an array? Explain declaration, initialization and accessing the elements of a one-dimensional array. Write a program to find the largest of 5 numbers stored in an array.");
  theory("What is a function? Explain function declaration (prototype), definition and calling. Differentiate between call by value and call by reference with a small example.");
  theory("Define class and object. Write a C++ class `Student` with data members and a member function that is defined outside the class using the scope resolution operator (::).");
  theory("What are constructors and destructors? Explain the default and parameterized constructor with a short program and show the order in which constructors and destructors are called.");
})();
