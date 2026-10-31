// Static demo data for ThatKJ/sieve-demo-target offline fallback on public deployments
"use strict";

window.SIEVE_DEMO_DATA = {
  "atlas": {
    "owner": "ThatKJ",
    "repo": "sieve-demo-target",
    "ref": "567e690af6d9302fff7c3e045fb9e7265b8d6639",
    "ref_name": "main",
    "graph": {
      "nodes": [
        {
          "id": "ledgerly/__init__.py",
          "dir": "ledgerly",
          "lang": "python",
          "test": false,
          "lines": 7,
          "symbols": [],
          "degree": 3
        },
        {
          "id": "ledgerly/budget.py",
          "dir": "ledgerly",
          "lang": "python",
          "test": false,
          "lines": 16,
          "symbols": [
            "Budget"
          ],
          "degree": 8
        },
        {
          "id": "ledgerly/categories.py",
          "dir": "ledgerly",
          "lang": "python",
          "test": false,
          "lines": 13,
          "symbols": [
            "category_totals"
          ],
          "degree": 4
        },
        {
          "id": "ledgerly/cli.py",
          "dir": "ledgerly",
          "lang": "python",
          "test": false,
          "lines": 15,
          "symbols": [
            "main"
          ],
          "degree": 3
        },
        {
          "id": "ledgerly/currency.py",
          "dir": "ledgerly",
          "lang": "python",
          "test": false,
          "lines": 7,
          "symbols": [
            "symbol_for"
          ],
          "degree": 1
        },
        {
          "id": "ledgerly/io/__init__.py",
          "dir": "ledgerly/io",
          "lang": "python",
          "test": false,
          "lines": 1,
          "symbols": [],
          "degree": 0
        },
        {
          "id": "ledgerly/io/csv_reader.py",
          "dir": "ledgerly/io",
          "lang": "python",
          "test": false,
          "lines": 10,
          "symbols": [
            "read_csv"
          ],
          "degree": 2
        },
        {
          "id": "ledgerly/io/json_writer.py",
          "dir": "ledgerly/io",
          "lang": "python",
          "test": false,
          "lines": 10,
          "symbols": [
            "to_json"
          ],
          "degree": 2
        },
        {
          "id": "ledgerly/money.py",
          "dir": "ledgerly",
          "lang": "python",
          "test": false,
          "lines": 31,
          "symbols": [
            "Money",
            "parse_amount",
            "format_amount"
          ],
          "degree": 11
        },
        {
          "id": "ledgerly/report.py",
          "dir": "ledgerly",
          "lang": "python",
          "test": false,
          "lines": 15,
          "symbols": [
            "monthly_summary"
          ],
          "degree": 6
        },
        {
          "id": "ledgerly/transactions.py",
          "dir": "ledgerly",
          "lang": "python",
          "test": false,
          "lines": 18,
          "symbols": [
            "Transaction",
            "from_row"
          ],
          "degree": 10
        },
        {
          "id": "tests/test_budget.py",
          "dir": "tests",
          "lang": "python",
          "test": true,
          "lines": 11,
          "symbols": [
            "test_remaining"
          ],
          "degree": 3
        },
        {
          "id": "tests/test_money.py",
          "dir": "tests",
          "lang": "python",
          "test": true,
          "lines": 11,
          "symbols": [
            "test_parse_amount",
            "test_format_amount"
          ],
          "degree": 1
        },
        {
          "id": "tests/test_report.py",
          "dir": "tests",
          "lang": "python",
          "test": true,
          "lines": 12,
          "symbols": [
            "test_summary_lists_categories"
          ],
          "degree": 4
        },
        {
          "id": "tests/test_transactions.py",
          "dir": "tests",
          "lang": "python",
          "test": true,
          "lines": 8,
          "symbols": [
            "test_from_row"
          ],
          "degree": 2
        }
      ],
      "edges": [
        {
          "source": "ledgerly/__init__.py",
          "target": "ledgerly/money.py",
          "line": 2,
          "names": [
            "Money",
            "format_amount",
            "parse_amount"
          ],
          "stmt": "from ledgerly.money import Money, format_amount, parse_amount"
        },
        {
          "source": "ledgerly/__init__.py",
          "target": "ledgerly/transactions.py",
          "line": 3,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction"
        },
        {
          "source": "ledgerly/__init__.py",
          "target": "ledgerly/budget.py",
          "line": 4,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget"
        },
        {
          "source": "ledgerly/budget.py",
          "target": "ledgerly/categories.py",
          "line": 4,
          "names": [
            "category_totals"
          ],
          "stmt": "from ledgerly.categories import category_totals"
        },
        {
          "source": "ledgerly/budget.py",
          "target": "ledgerly/money.py",
          "line": 5,
          "names": [
            "Money"
          ],
          "stmt": "from ledgerly.money import Money"
        },
        {
          "source": "ledgerly/budget.py",
          "target": "ledgerly/transactions.py",
          "line": 6,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction"
        },
        {
          "source": "ledgerly/categories.py",
          "target": "ledgerly/money.py",
          "line": 4,
          "names": [
            "Money"
          ],
          "stmt": "from ledgerly.money import Money"
        },
        {
          "source": "ledgerly/categories.py",
          "target": "ledgerly/transactions.py",
          "line": 5,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction"
        },
        {
          "source": "ledgerly/cli.py",
          "target": "ledgerly/budget.py",
          "line": 4,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget"
        },
        {
          "source": "ledgerly/cli.py",
          "target": "ledgerly/io/csv_reader.py",
          "line": 5,
          "names": [
            "read_csv"
          ],
          "stmt": "from ledgerly.io.csv_reader import read_csv"
        },
        {
          "source": "ledgerly/cli.py",
          "target": "ledgerly/report.py",
          "line": 6,
          "names": [
            "monthly_summary"
          ],
          "stmt": "from ledgerly.report import monthly_summary"
        },
        {
          "source": "ledgerly/io/csv_reader.py",
          "target": "ledgerly/transactions.py",
          "line": 4,
          "names": [
            "Transaction",
            "from_row"
          ],
          "stmt": "from ledgerly.transactions import Transaction, from_row"
        },
        {
          "source": "ledgerly/io/json_writer.py",
          "target": "ledgerly/money.py",
          "line": 4,
          "names": [
            "format_amount"
          ],
          "stmt": "from ledgerly.money import format_amount"
        },
        {
          "source": "ledgerly/io/json_writer.py",
          "target": "ledgerly/transactions.py",
          "line": 5,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction"
        },
        {
          "source": "ledgerly/money.py",
          "target": "ledgerly/currency.py",
          "line": 4,
          "names": [
            "symbol_for"
          ],
          "stmt": "from ledgerly.currency import symbol_for"
        },
        {
          "source": "ledgerly/report.py",
          "target": "ledgerly/budget.py",
          "line": 2,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget"
        },
        {
          "source": "ledgerly/report.py",
          "target": "ledgerly/categories.py",
          "line": 3,
          "names": [
            "category_totals"
          ],
          "stmt": "from ledgerly.categories import category_totals"
        },
        {
          "source": "ledgerly/report.py",
          "target": "ledgerly/money.py",
          "line": 4,
          "names": [
            "format_amount"
          ],
          "stmt": "from ledgerly.money import format_amount"
        },
        {
          "source": "ledgerly/report.py",
          "target": "ledgerly/transactions.py",
          "line": 5,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction"
        },
        {
          "source": "ledgerly/transactions.py",
          "target": "ledgerly/money.py",
          "line": 5,
          "names": [
            "Money",
            "parse_amount"
          ],
          "stmt": "from ledgerly.money import Money, parse_amount"
        },
        {
          "source": "tests/test_budget.py",
          "target": "ledgerly/budget.py",
          "line": 3,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget"
        },
        {
          "source": "tests/test_budget.py",
          "target": "ledgerly/money.py",
          "line": 4,
          "names": [
            "Money"
          ],
          "stmt": "from ledgerly.money import Money"
        },
        {
          "source": "tests/test_budget.py",
          "target": "ledgerly/transactions.py",
          "line": 5,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction"
        },
        {
          "source": "tests/test_money.py",
          "target": "ledgerly/money.py",
          "line": 1,
          "names": [
            "Money",
            "format_amount",
            "parse_amount"
          ],
          "stmt": "from ledgerly.money import Money, format_amount, parse_amount"
        },
        {
          "source": "tests/test_report.py",
          "target": "ledgerly/budget.py",
          "line": 3,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget"
        },
        {
          "source": "tests/test_report.py",
          "target": "ledgerly/money.py",
          "line": 4,
          "names": [
            "Money"
          ],
          "stmt": "from ledgerly.money import Money"
        },
        {
          "source": "tests/test_report.py",
          "target": "ledgerly/report.py",
          "line": 5,
          "names": [
            "monthly_summary"
          ],
          "stmt": "from ledgerly.report import monthly_summary"
        },
        {
          "source": "tests/test_report.py",
          "target": "ledgerly/transactions.py",
          "line": 6,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction"
        },
        {
          "source": "tests/test_transactions.py",
          "target": "ledgerly/money.py",
          "line": 1,
          "names": [
            "Money"
          ],
          "stmt": "from ledgerly.money import Money"
        },
        {
          "source": "tests/test_transactions.py",
          "target": "ledgerly/transactions.py",
          "line": 2,
          "names": [
            "from_row"
          ],
          "stmt": "from ledgerly.transactions import from_row"
        }
      ],
      "truncated": false,
      "unparsed": [],
      "fingerprint": {
        "files": 20,
        "source_files": 15,
        "test_files": 4,
        "import_edges": 30,
        "languages": [
          [
            "Python",
            15
          ],
          [
            "Markdown",
            3
          ]
        ],
        "top_dirs": [
          [
            "ledgerly",
            11
          ],
          [
            "tests",
            4
          ],
          [
            ".github",
            1
          ]
        ],
        "most_imported": [
          {
            "file": "ledgerly/money.py",
            "importers": 10
          },
          {
            "file": "ledgerly/transactions.py",
            "importers": 9
          },
          {
            "file": "ledgerly/budget.py",
            "importers": 5
          },
          {
            "file": "ledgerly/categories.py",
            "importers": 2
          },
          {
            "file": "ledgerly/report.py",
            "importers": 2
          }
        ],
        "has_contributing": true,
        "has_ci": false
      }
    },
    "impact": null,
    "pr": null
  },
  "pr3": {
    "pr": {
      "owner": "ThatKJ",
      "repo": "sieve-demo-target",
      "number": 3,
      "title": "Show negative amounts as -$5.00 instead of $-5.00",
      "url": "https://github.com/ThatKJ/sieve-demo-target/pull/3",
      "author": "ThatKJ",
      "author_avatar": "https://avatars.githubusercontent.com/u/94427416?v=4",
      "association": "OWNER",
      "state": "open",
      "merged": false,
      "created_at": "2026-10-30T19:48:14Z",
      "additions": 7,
      "deletions": 1,
      "changed_files": 2,
      "linked_issues": [
        1
      ]
    },
    "score": 100,
    "verdict": "ready",
    "findings": [
      {
        "check": "imports",
        "status": "info",
        "title": "No new repo-local imports to verify",
        "detail": "",
        "evidence": [],
        "fix": null,
        "penalty": 0,
        "source": "repository"
      },
      {
        "check": "description",
        "status": "pass",
        "title": "Has a written description",
        "detail": "",
        "evidence": [],
        "fix": null,
        "penalty": 0,
        "source": "github"
      },
      {
        "check": "linked_issue",
        "status": "pass",
        "title": "Resolves open issue #1: format_amount renders negative values as $-5.00",
        "detail": "",
        "evidence": [
          "https://github.com/ThatKJ/sieve-demo-target/issues/1"
        ],
        "fix": null,
        "penalty": 0,
        "source": "github"
      },
      {
        "check": "substance",
        "status": "pass",
        "title": "2 file(s), 8 changed line(s)",
        "detail": "",
        "evidence": [],
        "fix": null,
        "penalty": 0,
        "source": "github"
      },
      {
        "check": "tests",
        "status": "pass",
        "title": "Includes 1 test file(s)",
        "detail": "",
        "evidence": [
          "tests/test_money.py"
        ],
        "fix": null,
        "penalty": 0,
        "source": "github"
      },
      {
        "check": "references",
        "status": "pass",
        "title": "Every file named in the description exists",
        "detail": "",
        "evidence": [],
        "fix": null,
        "penalty": 0,
        "source": "repository"
      },
      {
        "check": "template",
        "status": "pass",
        "title": "Follows the PR template (3/3 sections)",
        "detail": "",
        "evidence": [],
        "fix": null,
        "penalty": 0,
        "source": "repository"
      }
    ],
    "impact": {
      "nodes": [
        {
          "id": "ledgerly/__init__.py",
          "path": "ledgerly/__init__.py",
          "role": "direct",
          "lang": "python",
          "is_test": false,
          "degree": 3,
          "symbols": [],
          "reason": "Imports ledgerly/money.py (line 2: from ledgerly.money import Money, format_amount, parse_amount)",
          "via": "ledgerly/money.py"
        },
        {
          "id": "ledgerly/budget.py",
          "path": "ledgerly/budget.py",
          "role": "direct",
          "lang": "python",
          "is_test": false,
          "degree": 8,
          "symbols": [
            "Budget"
          ],
          "reason": "Imports ledgerly/money.py (line 5: from ledgerly.money import Money)",
          "via": "ledgerly/money.py"
        },
        {
          "id": "ledgerly/categories.py",
          "path": "ledgerly/categories.py",
          "role": "direct",
          "lang": "python",
          "is_test": false,
          "degree": 4,
          "symbols": [
            "category_totals"
          ],
          "reason": "Imports ledgerly/money.py (line 4: from ledgerly.money import Money)",
          "via": "ledgerly/money.py"
        },
        {
          "id": "ledgerly/cli.py",
          "path": "ledgerly/cli.py",
          "role": "indirect",
          "lang": "python",
          "is_test": false,
          "degree": 3,
          "symbols": [
            "main"
          ],
          "reason": "Imports ledgerly/budget.py, which depends on the change (line 4)",
          "via": "ledgerly/budget.py"
        },
        {
          "id": "ledgerly/currency.py",
          "path": "ledgerly/currency.py",
          "role": "dependency",
          "lang": "python",
          "is_test": false,
          "degree": 1,
          "symbols": [
            "symbol_for"
          ],
          "reason": "Used by changed file ledgerly/money.py (line 4)",
          "via": "ledgerly/money.py"
        },
        {
          "id": "ledgerly/io/csv_reader.py",
          "path": "ledgerly/io/csv_reader.py",
          "role": "indirect",
          "lang": "python",
          "is_test": false,
          "degree": 2,
          "symbols": [
            "read_csv"
          ],
          "reason": "Imports ledgerly/transactions.py, which depends on the change (line 4)",
          "via": "ledgerly/transactions.py"
        },
        {
          "id": "ledgerly/io/json_writer.py",
          "path": "ledgerly/io/json_writer.py",
          "role": "direct",
          "lang": "python",
          "is_test": false,
          "degree": 2,
          "symbols": [
            "to_json"
          ],
          "reason": "Imports ledgerly/money.py (line 4: from ledgerly.money import format_amount)",
          "via": "ledgerly/money.py"
        },
        {
          "id": "ledgerly/money.py",
          "path": "ledgerly/money.py",
          "role": "modified",
          "lang": "python",
          "is_test": false,
          "degree": 11,
          "symbols": [
            "Money",
            "parse_amount",
            "format_amount"
          ],
          "reason": "Modified in this PR",
          "via": null
        },
        {
          "id": "ledgerly/report.py",
          "path": "ledgerly/report.py",
          "role": "direct",
          "lang": "python",
          "is_test": false,
          "degree": 6,
          "symbols": [
            "monthly_summary"
          ],
          "reason": "Imports ledgerly/money.py (line 4: from ledgerly.money import format_amount)",
          "via": "ledgerly/money.py"
        },
        {
          "id": "ledgerly/transactions.py",
          "path": "ledgerly/transactions.py",
          "role": "direct",
          "lang": "python",
          "is_test": false,
          "degree": 10,
          "symbols": [
            "Transaction",
            "from_row"
          ],
          "reason": "Imports ledgerly/money.py (line 5: from ledgerly.money import Money, parse_amount)",
          "via": "ledgerly/money.py"
        },
        {
          "id": "tests/test_budget.py",
          "path": "tests/test_budget.py",
          "role": "direct",
          "lang": "python",
          "is_test": true,
          "degree": 3,
          "symbols": [
            "test_remaining"
          ],
          "reason": "Imports ledgerly/money.py (line 4: from ledgerly.money import Money)",
          "via": "ledgerly/money.py"
        },
        {
          "id": "tests/test_money.py",
          "path": "tests/test_money.py",
          "role": "modified",
          "lang": "python",
          "is_test": true,
          "degree": 1,
          "symbols": [
            "test_parse_amount",
            "test_format_amount"
          ],
          "reason": "Modified in this PR",
          "via": null
        },
        {
          "id": "tests/test_report.py",
          "path": "tests/test_report.py",
          "role": "direct",
          "lang": "python",
          "is_test": true,
          "degree": 4,
          "symbols": [
            "test_summary_lists_categories"
          ],
          "reason": "Imports ledgerly/money.py (line 4: from ledgerly.money import Money)",
          "via": "ledgerly/money.py"
        },
        {
          "id": "tests/test_transactions.py",
          "path": "tests/test_transactions.py",
          "role": "direct",
          "lang": "python",
          "is_test": true,
          "degree": 2,
          "symbols": [
            "test_from_row"
          ],
          "reason": "Imports ledgerly/money.py (line 1: from ledgerly.money import Money)",
          "via": "ledgerly/money.py"
        }
      ],
      "edges": [
        {
          "source": "ledgerly/__init__.py",
          "target": "ledgerly/money.py",
          "line": 2,
          "names": [
            "Money",
            "format_amount",
            "parse_amount"
          ],
          "stmt": "from ledgerly.money import Money, format_amount, parse_amount",
          "type": "imports"
        },
        {
          "source": "ledgerly/__init__.py",
          "target": "ledgerly/transactions.py",
          "line": 3,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction",
          "type": "imports"
        },
        {
          "source": "ledgerly/__init__.py",
          "target": "ledgerly/budget.py",
          "line": 4,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget",
          "type": "imports"
        },
        {
          "source": "ledgerly/budget.py",
          "target": "ledgerly/categories.py",
          "line": 4,
          "names": [
            "category_totals"
          ],
          "stmt": "from ledgerly.categories import category_totals",
          "type": "imports"
        },
        {
          "source": "ledgerly/budget.py",
          "target": "ledgerly/money.py",
          "line": 5,
          "names": [
            "Money"
          ],
          "stmt": "from ledgerly.money import Money",
          "type": "imports"
        },
        {
          "source": "ledgerly/budget.py",
          "target": "ledgerly/transactions.py",
          "line": 6,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction",
          "type": "imports"
        },
        {
          "source": "ledgerly/categories.py",
          "target": "ledgerly/money.py",
          "line": 4,
          "names": [
            "Money"
          ],
          "stmt": "from ledgerly.money import Money",
          "type": "imports"
        },
        {
          "source": "ledgerly/categories.py",
          "target": "ledgerly/transactions.py",
          "line": 5,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction",
          "type": "imports"
        },
        {
          "source": "ledgerly/cli.py",
          "target": "ledgerly/budget.py",
          "line": 4,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget",
          "type": "imports"
        },
        {
          "source": "ledgerly/cli.py",
          "target": "ledgerly/io/csv_reader.py",
          "line": 5,
          "names": [
            "read_csv"
          ],
          "stmt": "from ledgerly.io.csv_reader import read_csv",
          "type": "imports"
        },
        {
          "source": "ledgerly/cli.py",
          "target": "ledgerly/report.py",
          "line": 6,
          "names": [
            "monthly_summary"
          ],
          "stmt": "from ledgerly.report import monthly_summary",
          "type": "imports"
        },
        {
          "source": "ledgerly/io/csv_reader.py",
          "target": "ledgerly/transactions.py",
          "line": 4,
          "names": [
            "Transaction",
            "from_row"
          ],
          "stmt": "from ledgerly.transactions import Transaction, from_row",
          "type": "imports"
        },
        {
          "source": "ledgerly/io/json_writer.py",
          "target": "ledgerly/money.py",
          "line": 4,
          "names": [
            "format_amount"
          ],
          "stmt": "from ledgerly.money import format_amount",
          "type": "imports"
        },
        {
          "source": "ledgerly/io/json_writer.py",
          "target": "ledgerly/transactions.py",
          "line": 5,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction",
          "type": "imports"
        },
        {
          "source": "ledgerly/money.py",
          "target": "ledgerly/currency.py",
          "line": 4,
          "names": [
            "symbol_for"
          ],
          "stmt": "from ledgerly.currency import symbol_for",
          "type": "imports"
        },
        {
          "source": "ledgerly/report.py",
          "target": "ledgerly/budget.py",
          "line": 2,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget",
          "type": "imports"
        },
        {
          "source": "ledgerly/report.py",
          "target": "ledgerly/categories.py",
          "line": 3,
          "names": [
            "category_totals"
          ],
          "stmt": "from ledgerly.categories import category_totals",
          "type": "imports"
        },
        {
          "source": "ledgerly/report.py",
          "target": "ledgerly/money.py",
          "line": 4,
          "names": [
            "format_amount"
          ],
          "stmt": "from ledgerly.money import format_amount",
          "type": "imports"
        },
        {
          "source": "ledgerly/report.py",
          "target": "ledgerly/transactions.py",
          "line": 5,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction",
          "type": "imports"
        },
        {
          "source": "ledgerly/transactions.py",
          "target": "ledgerly/money.py",
          "line": 5,
          "names": [
            "Money",
            "parse_amount"
          ],
          "stmt": "from ledgerly.money import Money, parse_amount",
          "type": "imports"
        },
        {
          "source": "tests/test_budget.py",
          "target": "ledgerly/budget.py",
          "line": 3,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget",
          "type": "imports"
        },
        {
          "source": "tests/test_budget.py",
          "target": "ledgerly/money.py",
          "line": 4,
          "names": [
            "Money"
          ],
          "stmt": "from ledgerly.money import Money",
          "type": "imports"
        },
        {
          "source": "tests/test_budget.py",
          "target": "ledgerly/transactions.py",
          "line": 5,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction",
          "type": "imports"
        },
        {
          "source": "tests/test_money.py",
          "target": "ledgerly/money.py",
          "line": 1,
          "names": [
            "Money",
            "format_amount",
            "parse_amount"
          ],
          "stmt": "from ledgerly.money import Money, format_amount, parse_amount",
          "type": "imports"
        },
        {
          "source": "tests/test_report.py",
          "target": "ledgerly/budget.py",
          "line": 3,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget",
          "type": "imports"
        },
        {
          "source": "tests/test_report.py",
          "target": "ledgerly/money.py",
          "line": 4,
          "names": [
            "Money"
          ],
          "stmt": "from ledgerly.money import Money",
          "type": "imports"
        },
        {
          "source": "tests/test_report.py",
          "target": "ledgerly/report.py",
          "line": 5,
          "names": [
            "monthly_summary"
          ],
          "stmt": "from ledgerly.report import monthly_summary",
          "type": "imports"
        },
        {
          "source": "tests/test_report.py",
          "target": "ledgerly/transactions.py",
          "line": 6,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction",
          "type": "imports"
        },
        {
          "source": "tests/test_transactions.py",
          "target": "ledgerly/money.py",
          "line": 1,
          "names": [
            "Money"
          ],
          "stmt": "from ledgerly.money import Money",
          "type": "imports"
        },
        {
          "source": "tests/test_transactions.py",
          "target": "ledgerly/transactions.py",
          "line": 2,
          "names": [
            "from_row"
          ],
          "stmt": "from ledgerly.transactions import from_row",
          "type": "imports"
        }
      ],
      "summary": {
        "changed_files": 2,
        "direct_dependents": 9,
        "related_test_files": 3,
        "unresolved_imports": 0
      },
      "limitations": [
        "Static import analysis does not track dynamic runtime imports (e.g. importlib)."
      ],
      "marks": {
        "tests/test_money.py": {
          "role": "modified",
          "reason": "Modified in this PR",
          "via": null
        },
        "ledgerly/money.py": {
          "role": "modified",
          "reason": "Modified in this PR",
          "via": null
        },
        "ledgerly/__init__.py": {
          "role": "direct",
          "reason": "Imports ledgerly/money.py (line 2: from ledgerly.money import Money, format_amount, parse_amount)",
          "via": "ledgerly/money.py"
        },
        "ledgerly/budget.py": {
          "role": "direct",
          "reason": "Imports ledgerly/money.py (line 5: from ledgerly.money import Money)",
          "via": "ledgerly/money.py"
        },
        "ledgerly/categories.py": {
          "role": "direct",
          "reason": "Imports ledgerly/money.py (line 4: from ledgerly.money import Money)",
          "via": "ledgerly/money.py"
        },
        "ledgerly/io/json_writer.py": {
          "role": "direct",
          "reason": "Imports ledgerly/money.py (line 4: from ledgerly.money import format_amount)",
          "via": "ledgerly/money.py"
        },
        "ledgerly/report.py": {
          "role": "direct",
          "reason": "Imports ledgerly/money.py (line 4: from ledgerly.money import format_amount)",
          "via": "ledgerly/money.py"
        },
        "ledgerly/transactions.py": {
          "role": "direct",
          "reason": "Imports ledgerly/money.py (line 5: from ledgerly.money import Money, parse_amount)",
          "via": "ledgerly/money.py"
        },
        "tests/test_budget.py": {
          "role": "direct",
          "reason": "Imports ledgerly/money.py (line 4: from ledgerly.money import Money)",
          "via": "ledgerly/money.py"
        },
        "tests/test_report.py": {
          "role": "direct",
          "reason": "Imports ledgerly/money.py (line 4: from ledgerly.money import Money)",
          "via": "ledgerly/money.py"
        },
        "tests/test_transactions.py": {
          "role": "direct",
          "reason": "Imports ledgerly/money.py (line 1: from ledgerly.money import Money)",
          "via": "ledgerly/money.py"
        },
        "ledgerly/cli.py": {
          "role": "indirect",
          "reason": "Imports ledgerly/budget.py, which depends on the change (line 4)",
          "via": "ledgerly/budget.py"
        },
        "ledgerly/io/csv_reader.py": {
          "role": "indirect",
          "reason": "Imports ledgerly/transactions.py, which depends on the change (line 4)",
          "via": "ledgerly/transactions.py"
        },
        "ledgerly/currency.py": {
          "role": "dependency",
          "reason": "Used by changed file ledgerly/money.py (line 4)",
          "via": "ledgerly/money.py"
        }
      },
      "counts": {
        "changed": 2,
        "direct": 9,
        "indirect": 2,
        "dependencies": 1,
        "tests": 3
      },
      "tests": [
        {
          "file": "tests/test_budget.py",
          "reason": "Imports ledgerly/money.py (line 4: from ledgerly.money import Money)"
        },
        {
          "file": "tests/test_report.py",
          "reason": "Imports ledgerly/money.py (line 4: from ledgerly.money import Money)"
        },
        {
          "file": "tests/test_transactions.py",
          "reason": "Imports ledgerly/money.py (line 1: from ledgerly.money import Money)"
        }
      ],
      "risks": [
        {
          "level": "medium",
          "kind": "shared-module",
          "file": "ledgerly/money.py",
          "title": "Modifies a shared module imported by 10 files",
          "evidence": [],
          "source": "repository"
        }
      ],
      "plan": [
        {
          "action": "run",
          "text": "Run the tests that exercise the changed code",
          "command": "pytest tests/test_money.py tests/test_budget.py tests/test_report.py tests/test_transactions.py"
        },
        {
          "action": "inspect",
          "text": "Check that ledgerly/__init__.py still works with the change (it imports ledgerly/money.py at line 2)",
          "target": "ledgerly/__init__.py"
        },
        {
          "action": "inspect",
          "text": "Check that ledgerly/budget.py still works with the change (it imports ledgerly/money.py at line 5)",
          "target": "ledgerly/budget.py"
        },
        {
          "action": "inspect",
          "text": "Check that ledgerly/categories.py still works with the change (it imports ledgerly/money.py at line 4)",
          "target": "ledgerly/categories.py"
        }
      ]
    },
    "archaeology": {
      "time_window_days": 90,
      "files_inspected": [
        "ledgerly/money.py",
        "tests/test_money.py"
      ],
      "total_commits": 1,
      "distinct_contributors": 1,
      "per_file_churn": {
        "ledgerly/money.py": 1,
        "tests/test_money.py": 1
      },
      "candidate_reverts": [],
      "candidate_fixes": [],
      "recent_commits": [
        {
          "sha": "567e690",
          "full_sha": "567e690af6d9302fff7c3e045fb9e7265b8d6639",
          "message": "Initial ledgerly library",
          "author": "ThatKJ",
          "date": "2026-10-30T19:47:39Z",
          "url": "https://github.com/ThatKJ/sieve-demo-target/commit/567e690af6d9302fff7c3e045fb9e7265b8d6639",
          "file": "ledgerly/money.py"
        }
      ],
      "status": "ok"
    },
    "model": null,
    "ledger": {
      "groups": [
        {
          "source": "repository",
          "label": "Verified against repository files",
          "items": [
            "No new repo-local imports to verify",
            "Every file named in the description exists",
            "Follows the PR template (3/3 sections)"
          ]
        },
        {
          "source": "github",
          "label": "Derived from GitHub PR metadata and diff",
          "items": [
            "Has a written description",
            "Resolves open issue #1: format_amount renders negative values as $-5.00",
            "2 file(s), 8 changed line(s)",
            "Includes 1 test file(s)"
          ]
        },
        {
          "source": "model",
          "label": "Inferred by the local model",
          "items": []
        }
      ],
      "unknown": [
        "Tests were not executed: Sieve never runs contributor code.",
        "Relevance to the issue not judged (model check not requested)."
      ]
    },
    "comment": "Thanks @ThatKJ! Automated intake checks passed; a maintainer will review this soon.",
    "tree_truncated": false,
    "elapsed_s": 1.1
  },
  "pr4": {
    "pr": {
      "owner": "ThatKJ",
      "repo": "sieve-demo-target",
      "number": 4,
      "title": "Enhance budget module with robust error handling and comprehensive tests",
      "url": "https://github.com/ThatKJ/sieve-demo-target/pull/4",
      "author": "ThatKJ",
      "author_avatar": "https://avatars.githubusercontent.com/u/94427416?v=4",
      "association": "OWNER",
      "state": "open",
      "merged": false,
      "created_at": "2026-10-30T19:48:20Z",
      "additions": 6,
      "deletions": 3,
      "changed_files": 2,
      "linked_issues": [
        2
      ]
    },
    "score": 25,
    "verdict": "low-effort",
    "findings": [
      {
        "check": "tests",
        "status": "fail",
        "title": "Claims tests were added, but the diff has no test files",
        "detail": "Description says \u201cAdded comprehensive unit tests\u201d, yet none of the 2 changed files is a test.",
        "evidence": [],
        "fix": "The description mentions tests but none are included. Add them or correct the description.",
        "penalty": 20,
        "source": "github"
      },
      {
        "check": "imports",
        "status": "fail",
        "title": "1 import(s) point at modules that don't exist",
        "detail": "These repo-local imports resolve to no file in the base branch or this PR, which is a common sign of generated code that was never run.",
        "evidence": [
          "ledgerly/budget.py: imports `ledgerly.validators`"
        ],
        "fix": "Some imports reference modules that don't exist in the repo. Run the code locally and fix them.",
        "penalty": 25,
        "source": "repository"
      },
      {
        "check": "references",
        "status": "fail",
        "title": "Description mentions 2 file(s) that don't exist",
        "detail": "Neither the repository nor this PR contains these paths.",
        "evidence": [
          "ledgerly/validators.py",
          "tests/test_budget_validation.py"
        ],
        "fix": "The description refers to files that aren't in the repo: `ledgerly/validators.py`, `tests/test_budget_validation.py`. Please correct it.",
        "penalty": 20,
        "source": "repository"
      },
      {
        "check": "template",
        "status": "warn",
        "title": "PR template not followed",
        "detail": "Found 0 of 3 template sections.",
        "evidence": [
          "What does this change?",
          "How was it tested?",
          "Checklist"
        ],
        "fix": "Please fill in the repository's PR template sections: What does this change?, How was it tested?, Checklist.",
        "penalty": 10,
        "source": "repository"
      },
      {
        "check": "description",
        "status": "pass",
        "title": "Has a written description",
        "detail": "",
        "evidence": [],
        "fix": null,
        "penalty": 0,
        "source": "github"
      },
      {
        "check": "linked_issue",
        "status": "pass",
        "title": "Resolves open issue #2: Budget.remaining() crashes for a category with no transactions",
        "detail": "",
        "evidence": [
          "https://github.com/ThatKJ/sieve-demo-target/issues/2"
        ],
        "fix": null,
        "penalty": 0,
        "source": "github"
      },
      {
        "check": "substance",
        "status": "pass",
        "title": "2 file(s), 9 changed line(s)",
        "detail": "",
        "evidence": [],
        "fix": null,
        "penalty": 0,
        "source": "github"
      }
    ],
    "impact": {
      "nodes": [
        {
          "id": "ledgerly/__init__.py",
          "path": "ledgerly/__init__.py",
          "role": "direct",
          "lang": "python",
          "is_test": false,
          "degree": 3,
          "symbols": [],
          "reason": "Imports ledgerly/budget.py (line 4: from ledgerly.budget import Budget)",
          "via": "ledgerly/budget.py"
        },
        {
          "id": "ledgerly/budget.py",
          "path": "ledgerly/budget.py",
          "role": "modified",
          "lang": "python",
          "is_test": false,
          "degree": 8,
          "symbols": [
            "Budget"
          ],
          "reason": "Modified in this PR",
          "via": null
        },
        {
          "id": "ledgerly/categories.py",
          "path": "ledgerly/categories.py",
          "role": "modified",
          "lang": "python",
          "is_test": false,
          "degree": 4,
          "symbols": [
            "category_totals"
          ],
          "reason": "Modified in this PR",
          "via": null
        },
        {
          "id": "ledgerly/cli.py",
          "path": "ledgerly/cli.py",
          "role": "direct",
          "lang": "python",
          "is_test": false,
          "degree": 3,
          "symbols": [
            "main"
          ],
          "reason": "Imports ledgerly/budget.py (line 4: from ledgerly.budget import Budget)",
          "via": "ledgerly/budget.py"
        },
        {
          "id": "ledgerly/money.py",
          "path": "ledgerly/money.py",
          "role": "dependency",
          "lang": "python",
          "is_test": false,
          "degree": 11,
          "symbols": [
            "Money",
            "parse_amount",
            "format_amount"
          ],
          "reason": "Used by changed file ledgerly/budget.py (line 5)",
          "via": "ledgerly/budget.py"
        },
        {
          "id": "ledgerly/report.py",
          "path": "ledgerly/report.py",
          "role": "direct",
          "lang": "python",
          "is_test": false,
          "degree": 6,
          "symbols": [
            "monthly_summary"
          ],
          "reason": "Imports ledgerly/budget.py (line 2: from ledgerly.budget import Budget)",
          "via": "ledgerly/budget.py"
        },
        {
          "id": "ledgerly/transactions.py",
          "path": "ledgerly/transactions.py",
          "role": "dependency",
          "lang": "python",
          "is_test": false,
          "degree": 10,
          "symbols": [
            "Transaction",
            "from_row"
          ],
          "reason": "Used by changed file ledgerly/budget.py (line 6)",
          "via": "ledgerly/budget.py"
        },
        {
          "id": "tests/test_budget.py",
          "path": "tests/test_budget.py",
          "role": "direct",
          "lang": "python",
          "is_test": true,
          "degree": 3,
          "symbols": [
            "test_remaining"
          ],
          "reason": "Imports ledgerly/budget.py (line 3: from ledgerly.budget import Budget)",
          "via": "ledgerly/budget.py"
        },
        {
          "id": "tests/test_report.py",
          "path": "tests/test_report.py",
          "role": "direct",
          "lang": "python",
          "is_test": true,
          "degree": 4,
          "symbols": [
            "test_summary_lists_categories"
          ],
          "reason": "Imports ledgerly/budget.py (line 3: from ledgerly.budget import Budget)",
          "via": "ledgerly/budget.py"
        }
      ],
      "edges": [
        {
          "source": "ledgerly/__init__.py",
          "target": "ledgerly/money.py",
          "line": 2,
          "names": [
            "Money",
            "format_amount",
            "parse_amount"
          ],
          "stmt": "from ledgerly.money import Money, format_amount, parse_amount",
          "type": "imports"
        },
        {
          "source": "ledgerly/__init__.py",
          "target": "ledgerly/transactions.py",
          "line": 3,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction",
          "type": "imports"
        },
        {
          "source": "ledgerly/__init__.py",
          "target": "ledgerly/budget.py",
          "line": 4,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget",
          "type": "imports"
        },
        {
          "source": "ledgerly/budget.py",
          "target": "ledgerly/categories.py",
          "line": 4,
          "names": [
            "category_totals"
          ],
          "stmt": "from ledgerly.categories import category_totals",
          "type": "imports"
        },
        {
          "source": "ledgerly/budget.py",
          "target": "ledgerly/money.py",
          "line": 5,
          "names": [
            "Money"
          ],
          "stmt": "from ledgerly.money import Money",
          "type": "imports"
        },
        {
          "source": "ledgerly/budget.py",
          "target": "ledgerly/transactions.py",
          "line": 6,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction",
          "type": "imports"
        },
        {
          "source": "ledgerly/categories.py",
          "target": "ledgerly/money.py",
          "line": 4,
          "names": [
            "Money"
          ],
          "stmt": "from ledgerly.money import Money",
          "type": "imports"
        },
        {
          "source": "ledgerly/categories.py",
          "target": "ledgerly/transactions.py",
          "line": 5,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction",
          "type": "imports"
        },
        {
          "source": "ledgerly/cli.py",
          "target": "ledgerly/budget.py",
          "line": 4,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget",
          "type": "imports"
        },
        {
          "source": "ledgerly/cli.py",
          "target": "ledgerly/report.py",
          "line": 6,
          "names": [
            "monthly_summary"
          ],
          "stmt": "from ledgerly.report import monthly_summary",
          "type": "imports"
        },
        {
          "source": "ledgerly/report.py",
          "target": "ledgerly/budget.py",
          "line": 2,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget",
          "type": "imports"
        },
        {
          "source": "ledgerly/report.py",
          "target": "ledgerly/categories.py",
          "line": 3,
          "names": [
            "category_totals"
          ],
          "stmt": "from ledgerly.categories import category_totals",
          "type": "imports"
        },
        {
          "source": "ledgerly/report.py",
          "target": "ledgerly/money.py",
          "line": 4,
          "names": [
            "format_amount"
          ],
          "stmt": "from ledgerly.money import format_amount",
          "type": "imports"
        },
        {
          "source": "ledgerly/report.py",
          "target": "ledgerly/transactions.py",
          "line": 5,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction",
          "type": "imports"
        },
        {
          "source": "ledgerly/transactions.py",
          "target": "ledgerly/money.py",
          "line": 5,
          "names": [
            "Money",
            "parse_amount"
          ],
          "stmt": "from ledgerly.money import Money, parse_amount",
          "type": "imports"
        },
        {
          "source": "tests/test_budget.py",
          "target": "ledgerly/budget.py",
          "line": 3,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget",
          "type": "imports"
        },
        {
          "source": "tests/test_budget.py",
          "target": "ledgerly/money.py",
          "line": 4,
          "names": [
            "Money"
          ],
          "stmt": "from ledgerly.money import Money",
          "type": "imports"
        },
        {
          "source": "tests/test_budget.py",
          "target": "ledgerly/transactions.py",
          "line": 5,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction",
          "type": "imports"
        },
        {
          "source": "tests/test_report.py",
          "target": "ledgerly/budget.py",
          "line": 3,
          "names": [
            "Budget"
          ],
          "stmt": "from ledgerly.budget import Budget",
          "type": "imports"
        },
        {
          "source": "tests/test_report.py",
          "target": "ledgerly/money.py",
          "line": 4,
          "names": [
            "Money"
          ],
          "stmt": "from ledgerly.money import Money",
          "type": "imports"
        },
        {
          "source": "tests/test_report.py",
          "target": "ledgerly/report.py",
          "line": 5,
          "names": [
            "monthly_summary"
          ],
          "stmt": "from ledgerly.report import monthly_summary",
          "type": "imports"
        },
        {
          "source": "tests/test_report.py",
          "target": "ledgerly/transactions.py",
          "line": 6,
          "names": [
            "Transaction"
          ],
          "stmt": "from ledgerly.transactions import Transaction",
          "type": "imports"
        }
      ],
      "summary": {
        "changed_files": 2,
        "direct_dependents": 5,
        "related_test_files": 2,
        "unresolved_imports": 0
      },
      "limitations": [
        "Static import analysis does not track dynamic runtime imports (e.g. importlib)."
      ],
      "marks": {
        "ledgerly/categories.py": {
          "role": "modified",
          "reason": "Modified in this PR",
          "via": null
        },
        "ledgerly/budget.py": {
          "role": "modified",
          "reason": "Modified in this PR",
          "via": null
        },
        "ledgerly/__init__.py": {
          "role": "direct",
          "reason": "Imports ledgerly/budget.py (line 4: from ledgerly.budget import Budget)",
          "via": "ledgerly/budget.py"
        },
        "ledgerly/cli.py": {
          "role": "direct",
          "reason": "Imports ledgerly/budget.py (line 4: from ledgerly.budget import Budget)",
          "via": "ledgerly/budget.py"
        },
        "ledgerly/report.py": {
          "role": "direct",
          "reason": "Imports ledgerly/budget.py (line 2: from ledgerly.budget import Budget)",
          "via": "ledgerly/budget.py"
        },
        "tests/test_budget.py": {
          "role": "direct",
          "reason": "Imports ledgerly/budget.py (line 3: from ledgerly.budget import Budget)",
          "via": "ledgerly/budget.py"
        },
        "tests/test_report.py": {
          "role": "direct",
          "reason": "Imports ledgerly/budget.py (line 3: from ledgerly.budget import Budget)",
          "via": "ledgerly/budget.py"
        },
        "ledgerly/money.py": {
          "role": "dependency",
          "reason": "Used by changed file ledgerly/budget.py (line 5)",
          "via": "ledgerly/budget.py"
        },
        "ledgerly/transactions.py": {
          "role": "dependency",
          "reason": "Used by changed file ledgerly/budget.py (line 6)",
          "via": "ledgerly/budget.py"
        }
      },
      "counts": {
        "changed": 2,
        "direct": 5,
        "indirect": 0,
        "dependencies": 2,
        "tests": 2
      },
      "tests": [
        {
          "file": "tests/test_budget.py",
          "reason": "Imports ledgerly/budget.py (line 3: from ledgerly.budget import Budget)"
        },
        {
          "file": "tests/test_report.py",
          "reason": "Imports ledgerly/budget.py (line 3: from ledgerly.budget import Budget)"
        }
      ],
      "risks": [
        {
          "level": "high",
          "kind": "removed-symbol-in-use",
          "file": "ledgerly/categories.py",
          "title": "`category_totals` is removed from ledgerly/categories.py but still imported elsewhere",
          "evidence": [
            "ledgerly/report.py:3  from ledgerly.categories import category_totals"
          ],
          "source": "repository"
        },
        {
          "level": "medium",
          "kind": "shared-module",
          "file": "ledgerly/budget.py",
          "title": "Modifies a shared module imported by 5 files",
          "evidence": [],
          "source": "repository"
        }
      ],
      "plan": [
        {
          "action": "fix",
          "text": "Resolve the broken reference: `category_totals` is removed from ledgerly/categories.py but still imported elsewhere",
          "target": "ledgerly/report.py"
        },
        {
          "action": "run",
          "text": "Run the tests that exercise the changed code",
          "command": "pytest tests/test_budget.py tests/test_report.py"
        },
        {
          "action": "inspect",
          "text": "Check that ledgerly/__init__.py still works with the change (it imports ledgerly/budget.py at line 4)",
          "target": "ledgerly/__init__.py"
        },
        {
          "action": "inspect",
          "text": "Check that ledgerly/cli.py still works with the change (it imports ledgerly/budget.py at line 4)",
          "target": "ledgerly/cli.py"
        },
        {
          "action": "inspect",
          "text": "Check that ledgerly/report.py still works with the change (it imports ledgerly/budget.py at line 2)",
          "target": "ledgerly/report.py"
        }
      ]
    },
    "archaeology": {
      "time_window_days": 90,
      "files_inspected": [
        "ledgerly/budget.py",
        "ledgerly/categories.py"
      ],
      "total_commits": 1,
      "distinct_contributors": 1,
      "per_file_churn": {
        "ledgerly/budget.py": 1,
        "ledgerly/categories.py": 1
      },
      "candidate_reverts": [],
      "candidate_fixes": [],
      "recent_commits": [
        {
          "sha": "567e690",
          "full_sha": "567e690af6d9302fff7c3e045fb9e7265b8d6639",
          "message": "Initial ledgerly library",
          "author": "ThatKJ",
          "date": "2026-10-30T19:47:39Z",
          "url": "https://github.com/ThatKJ/sieve-demo-target/commit/567e690af6d9302fff7c3e045fb9e7265b8d6639",
          "file": "ledgerly/budget.py"
        }
      ],
      "status": "ok"
    },
    "model": null,
    "ledger": {
      "groups": [
        {
          "source": "repository",
          "label": "Verified against repository files",
          "items": [
            "1 import(s) point at modules that don't exist",
            "Description mentions 2 file(s) that don't exist",
            "PR template not followed"
          ]
        },
        {
          "source": "github",
          "label": "Derived from GitHub PR metadata and diff",
          "items": [
            "Claims tests were added, but the diff has no test files",
            "Has a written description",
            "Resolves open issue #2: Budget.remaining() crashes for a category with no transactions",
            "2 file(s), 9 changed line(s)"
          ]
        },
        {
          "source": "model",
          "label": "Inferred by the local model",
          "items": []
        }
      ],
      "unknown": [
        "Tests were not executed: Sieve never runs contributor code.",
        "Relevance to the issue not judged (model check not requested)."
      ]
    },
    "comment": "Thanks for the contribution, @ThatKJ! Before a maintainer reviews this, could you take care of the following?\n\n- [ ] The description mentions tests but none are included. Add them or correct the description.\n- [ ] Some imports reference modules that don't exist in the repo. Run the code locally and fix them.\n- [ ] The description refers to files that aren't in the repo: `ledgerly/validators.py`, `tests/test_budget_validation.py`. Please correct it.\n- [ ] Please fill in the repository's PR template sections: What does this change?, How was it tested?, Checklist.\n\n_These checks are automated and may be wrong. Reply here if something doesn't apply._",
    "tree_truncated": false,
    "elapsed_s": 1.5
  },
  "pr5": {
    "pr": {
      "owner": "ThatKJ",
      "repo": "sieve-demo-target",
      "number": 5,
      "title": "Update README.md",
      "url": "https://github.com/ThatKJ/sieve-demo-target/pull/5",
      "author": "ThatKJ",
      "author_avatar": "https://avatars.githubusercontent.com/u/94427416?v=4",
      "association": "OWNER",
      "state": "open",
      "merged": false,
      "created_at": "2026-10-30T19:48:25Z",
      "additions": 1,
      "deletions": 1,
      "changed_files": 1,
      "linked_issues": []
    },
    "score": 43,
    "verdict": "low-effort",
    "findings": [
      {
        "check": "description",
        "status": "fail",
        "title": "Description is empty",
        "detail": "The PR body has no explanation of what changed or why.",
        "evidence": [],
        "fix": "Describe what the change does and why it's needed.",
        "penalty": 25,
        "source": "github"
      },
      {
        "check": "linked_issue",
        "status": "warn",
        "title": "No linked issue",
        "detail": "The PR doesn't say which issue it resolves (no 'Fixes #N').",
        "evidence": [],
        "fix": "Link the issue this PR resolves with `Fixes #<number>`, or explain why no issue exists.",
        "penalty": 10,
        "source": "github"
      },
      {
        "check": "substance",
        "status": "warn",
        "title": "Cosmetic docs edit (2 line(s))",
        "detail": "Tiny documentation-only change. Often legitimate typo fixes, often drive-by.",
        "evidence": [],
        "fix": null,
        "penalty": 12,
        "source": "github"
      },
      {
        "check": "template",
        "status": "warn",
        "title": "PR template not followed",
        "detail": "Found 0 of 3 template sections.",
        "evidence": [
          "What does this change?",
          "How was it tested?",
          "Checklist"
        ],
        "fix": "Please fill in the repository's PR template sections: What does this change?, How was it tested?, Checklist.",
        "penalty": 10,
        "source": "repository"
      },
      {
        "check": "tests",
        "status": "info",
        "title": "No code changes, so no tests expected",
        "detail": "",
        "evidence": [],
        "fix": null,
        "penalty": 0,
        "source": "github"
      },
      {
        "check": "imports",
        "status": "info",
        "title": "No new repo-local imports to verify",
        "detail": "",
        "evidence": [],
        "fix": null,
        "penalty": 0,
        "source": "repository"
      },
      {
        "check": "references",
        "status": "pass",
        "title": "Every file named in the description exists",
        "detail": "",
        "evidence": [],
        "fix": null,
        "penalty": 0,
        "source": "repository"
      }
    ],
    "impact": {
      "nodes": [],
      "edges": [],
      "summary": {
        "changed_files": 0,
        "direct_dependents": 0,
        "related_test_files": 0,
        "unresolved_imports": 0
      },
      "limitations": [
        "Static import analysis does not track dynamic runtime imports (e.g. importlib)."
      ],
      "marks": {},
      "counts": {
        "changed": 0,
        "direct": 0,
        "indirect": 0,
        "dependencies": 0,
        "tests": 0
      },
      "tests": [],
      "risks": [],
      "plan": [
        {
          "action": "inspect",
          "text": "Nothing in the import graph depends on these files; review the diff directly."
        }
      ]
    },
    "archaeology": {
      "time_window_days": 90,
      "files_inspected": [
        "README.md"
      ],
      "total_commits": 1,
      "distinct_contributors": 1,
      "per_file_churn": {
        "README.md": 1
      },
      "candidate_reverts": [],
      "candidate_fixes": [],
      "recent_commits": [
        {
          "sha": "567e690",
          "full_sha": "567e690af6d9302fff7c3e045fb9e7265b8d6639",
          "message": "Initial ledgerly library",
          "author": "ThatKJ",
          "date": "2026-10-30T19:47:39Z",
          "url": "https://github.com/ThatKJ/sieve-demo-target/commit/567e690af6d9302fff7c3e045fb9e7265b8d6639",
          "file": "README.md"
        }
      ],
      "status": "ok"
    },
    "model": null,
    "ledger": {
      "groups": [
        {
          "source": "repository",
          "label": "Verified against repository files",
          "items": [
            "PR template not followed",
            "No new repo-local imports to verify",
            "Every file named in the description exists"
          ]
        },
        {
          "source": "github",
          "label": "Derived from GitHub PR metadata and diff",
          "items": [
            "Description is empty",
            "No linked issue",
            "Cosmetic docs edit (2 line(s))",
            "No code changes, so no tests expected"
          ]
        },
        {
          "source": "model",
          "label": "Inferred by the local model",
          "items": []
        }
      ],
      "unknown": [
        "Tests were not executed: Sieve never runs contributor code.",
        "Relevance to the issue not judged (model check not requested)."
      ]
    },
    "comment": "Thanks for the contribution, @ThatKJ! Before a maintainer reviews this, could you take care of the following?\n\n- [ ] Describe what the change does and why it's needed.\n- [ ] Link the issue this PR resolves with `Fixes #<number>`, or explain why no issue exists.\n- [ ] Please fill in the repository's PR template sections: What does this change?, How was it tested?, Checklist.\n\n_These checks are automated and may be wrong. Reply here if something doesn't apply._",
    "tree_truncated": false,
    "elapsed_s": 0.6
  }
};
