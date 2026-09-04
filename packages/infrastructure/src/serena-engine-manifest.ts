const SERENA_EXPECTED_TOOL_INPUT_SCHEMAS = Object.freeze({
    "activate_project":  {
                             "type":  "object",
                             "properties":  {
                                                "project":  {
                                                                "title":  "Project",
                                                                "type":  "string",
                                                                "description":  "The name of a registered project to activate or a path to a project directory."
                                                            }
                                            },
                             "required":  [
                                              "project"
                                          ],
                             "title":  "applyArguments"
                         },
    "create_text_file":  {
                             "type":  "object",
                             "properties":  {
                                                "relative_path":  {
                                                                      "title":  "Relative Path",
                                                                      "type":  "string",
                                                                      "description":  "The relative path to the file to create."
                                                                  },
                                                "content":  {
                                                                "title":  "Content",
                                                                "type":  "string",
                                                                "description":  "The (appropriately encoded) content to write to the file."
                                                            }
                                            },
                             "required":  [
                                              "relative_path",
                                              "content"
                                          ],
                             "title":  "applyArguments"
                         },
    "execute_shell_command":  {
                                  "type":  "object",
                                  "properties":  {
                                                     "command":  {
                                                                     "title":  "Command",
                                                                     "type":  "string",
                                                                     "description":  "The shell command to execute."
                                                                 },
                                                     "cwd":  {
                                                                 "anyOf":  [
                                                                               {
                                                                                   "type":  "string"
                                                                               },
                                                                               {
                                                                                   "type":  "null"
                                                                               }
                                                                           ],
                                                                 "default":  null,
                                                                 "title":  "Cwd",
                                                                 "description":  "The working directory to execute the command in. If None, the project root will be used."
                                                             },
                                                     "capture_stderr":  {
                                                                            "default":  true,
                                                                            "title":  "Capture Stderr",
                                                                            "type":  "boolean",
                                                                            "description":  "Whether to capture and return stderr output."
                                                                        },
                                                     "max_answer_chars":  {
                                                                              "default":  -1,
                                                                              "title":  "Max Answer Chars",
                                                                              "type":  "integer",
                                                                              "description":  "If the output is longer than this number of characters,\nno content will be returned. -1 means using the default value, don\u0027t adjust unless there is no other way to get the content\nrequired for the task."
                                                                          }
                                                 },
                                  "required":  [
                                                   "command"
                                               ],
                                  "title":  "applyArguments"
                              },
    "find_declaration":  {
                             "type":  "object",
                             "properties":  {
                                                "relative_path":  {
                                                                      "title":  "Relative Path",
                                                                      "type":  "string",
                                                                      "description":  "The relative path to the source file containing the symbol for which to find the declaration."
                                                                  },
                                                "regex":  {
                                                              "title":  "Regex",
                                                              "type":  "string",
                                                              "description":  "A regular expression with one group, where the group matches the symbol for which to perform the lookup.\nFor example, to find the declaration of the `process` method in a call like `obj.process()`,\npass an expression like \"obj\\.(process)\\(process_input_arg=37\\)\".\nPrefer regexes with sufficiently large context around the group to render the match unambiguous.\nUses Python syntax with MULTILINE and DOTALL flags enabled."
                                                          },
                                                "containing_symbol_name_path":  {
                                                                                    "anyOf":  [
                                                                                                  {
                                                                                                      "type":  "string"
                                                                                                  },
                                                                                                  {
                                                                                                      "type":  "null"
                                                                                                  }
                                                                                              ],
                                                                                    "default":  null,
                                                                                    "title":  "Containing Symbol Name Path",
                                                                                    "description":  "Optional name path of a containing symbol whose body shall be searched instead of the full file."
                                                                                },
                                                "include_body":  {
                                                                     "default":  false,
                                                                     "title":  "Include Body",
                                                                     "type":  "boolean",
                                                                     "description":  "Whether to include the symbol\u0027s body in the result. Default False."
                                                                 },
                                                "include_info":  {
                                                                     "default":  false,
                                                                     "title":  "Include Info",
                                                                     "type":  "boolean",
                                                                     "description":  "Whether to include additional info (hover-like). Default False."
                                                                 }
                                            },
                             "required":  [
                                              "relative_path",
                                              "regex"
                                          ],
                             "title":  "applyArguments"
                         },
    "find_file":  {
                      "type":  "object",
                      "properties":  {
                                         "file_mask":  {
                                                           "title":  "File Mask",
                                                           "type":  "string",
                                                           "description":  "The filename or file mask (using the wildcards * or ?) to search for."
                                                       },
                                         "relative_path":  {
                                                               "title":  "Relative Path",
                                                               "type":  "string",
                                                               "description":  "The relative path to the directory to search in; pass \".\" to scan the project root."
                                                           }
                                     },
                      "required":  [
                                       "file_mask",
                                       "relative_path"
                                   ],
                      "title":  "applyArguments"
                  },
    "find_implementations":  {
                                 "type":  "object",
                                 "properties":  {
                                                    "name_path":  {
                                                                      "title":  "Name Path",
                                                                      "type":  "string",
                                                                      "description":  "The symbol\u0027s name path."
                                                                  },
                                                    "relative_path":  {
                                                                          "title":  "Relative Path",
                                                                          "type":  "string",
                                                                          "description":  "The relative path to the file containing the symbol for which to find implementations.\nNote that here you can\u0027t pass a directory but must pass a file."
                                                                      },
                                                    "include_info":  {
                                                                         "default":  false,
                                                                         "title":  "Include Info",
                                                                         "type":  "boolean",
                                                                         "description":  "Whether to include additional info (hover-like, typically including docstring and signature),\nabout the implementing symbols."
                                                                     },
                                                    "include_kinds":  {
                                                                          "default":  [

                                                                                      ],
                                                                          "items":  {
                                                                                        "type":  "integer"
                                                                                    },
                                                                          "title":  "Include Kinds",
                                                                          "type":  "array",
                                                                          "description":  "(optional) limits results to the given LSP symbol kinds (integers)."
                                                                      },
                                                    "exclude_kinds":  {
                                                                          "default":  [

                                                                                      ],
                                                                          "items":  {
                                                                                        "type":  "integer"
                                                                                    },
                                                                          "title":  "Exclude Kinds",
                                                                          "type":  "array",
                                                                          "description":  "(optional) list of LSP symbol kinds (integers) to exclude."
                                                                      },
                                                    "max_answer_chars":  {
                                                                             "default":  -1,
                                                                             "title":  "Max Answer Chars",
                                                                             "type":  "integer",
                                                                             "description":  "Max result length; -1 for default."
                                                                         }
                                                },
                                 "required":  [
                                                  "name_path",
                                                  "relative_path"
                                              ],
                                 "title":  "applyArguments"
                             },
    "find_referencing_symbols":  {
                                     "type":  "object",
                                     "properties":  {
                                                        "name_path":  {
                                                                          "title":  "Name Path",
                                                                          "type":  "string",
                                                                          "description":  "Name path of the symbol."
                                                                      },
                                                        "relative_path":  {
                                                                              "title":  "Relative Path",
                                                                              "type":  "string",
                                                                              "description":  "The relative path to the file containing the symbol for which to find references."
                                                                          },
                                                        "include_kinds":  {
                                                                              "default":  [

                                                                                          ],
                                                                              "items":  {
                                                                                            "type":  "integer"
                                                                                        },
                                                                              "title":  "Include Kinds",
                                                                              "type":  "array",
                                                                              "description":  "(optional) limits results to the given LSP symbol kinds (integers)."
                                                                          },
                                                        "exclude_kinds":  {
                                                                              "default":  [

                                                                                          ],
                                                                              "items":  {
                                                                                            "type":  "integer"
                                                                                        },
                                                                              "title":  "Exclude Kinds",
                                                                              "type":  "array",
                                                                              "description":  "Optional list of LSP symbol kinds (integers) to exclude."
                                                                          },
                                                        "max_answer_chars":  {
                                                                                 "default":  -1,
                                                                                 "title":  "Max Answer Chars",
                                                                                 "type":  "integer",
                                                                                 "description":  "Max result length; -1 for default."
                                                                             }
                                                    },
                                     "required":  [
                                                      "name_path",
                                                      "relative_path"
                                                  ],
                                     "title":  "applyArguments"
                                 },
    "find_symbol":  {
                        "type":  "object",
                        "properties":  {
                                           "name_path_pattern":  {
                                                                     "title":  "Name Path Pattern",
                                                                     "type":  "string",
                                                                     "description":  "The name path matching pattern (see above)."
                                                                 },
                                           "depth":  {
                                                         "default":  0,
                                                         "title":  "Depth",
                                                         "type":  "integer",
                                                         "description":  "Depth up to which descendants shall be retrieved (e.g. use 1 to also retrieve immediate children;\nfor the case where the symbol is a class, this will return its methods).\nIgnored if `include_body=True`. Default 0."
                                                     },
                                           "relative_path":  {
                                                                 "default":  "",
                                                                 "title":  "Relative Path",
                                                                 "type":  "string",
                                                                 "description":  "(optional) restrict search to this file or directory. If None, searches entire codebase.\nIf a directory is passed, the search will be restricted to the files in that directory.\nIf a file is passed, the search will be restricted to that file."
                                                             },
                                           "include_body":  {
                                                                "default":  false,
                                                                "title":  "Include Body",
                                                                "type":  "boolean",
                                                                "description":  "Whether to include the symbol\u0027s source code. Use judiciously."
                                                            },
                                           "include_info":  {
                                                                "default":  false,
                                                                "title":  "Include Info",
                                                                "type":  "boolean",
                                                                "description":  "Whether to include additional info (hover-like, typically including docstring and signature),\nabout the symbol (ignored if include_body is True). Info is never included for child symbols.\nNote: Depending on the language, this can be slow (e.g., C/C++)."
                                                            },
                                           "include_kinds":  {
                                                                 "default":  [

                                                                             ],
                                                                 "items":  {
                                                                               "type":  "integer"
                                                                           },
                                                                 "title":  "Include Kinds",
                                                                 "type":  "array",
                                                                 "description":  "(optional) limits results to the given LSP symbol kinds (integers)."
                                                             },
                                           "exclude_kinds":  {
                                                                 "default":  [

                                                                             ],
                                                                 "items":  {
                                                                               "type":  "integer"
                                                                           },
                                                                 "title":  "Exclude Kinds",
                                                                 "type":  "array",
                                                                 "description":  "(optional) list of LSP symbol kinds (integers) to exclude."
                                                             },
                                           "substring_matching":  {
                                                                      "default":  false,
                                                                      "title":  "Substring Matching",
                                                                      "type":  "boolean",
                                                                      "description":  "If True, use substring matching for the last element of the pattern, such that\n\"Foo/get\" would match \"Foo/getValue\" and \"Foo/getData\"."
                                                                  },
                                           "max_matches":  {
                                                               "default":  -1,
                                                               "title":  "Max Matches",
                                                               "type":  "integer",
                                                               "description":  "Maximum number of permitted matches. If exceeded, a shortened result is returned\nwhich allows refining the search. -1 (default) means no limit. Set to 1 if you search for a single symbol."
                                                           },
                                           "max_answer_chars":  {
                                                                    "default":  -1,
                                                                    "title":  "Max Answer Chars",
                                                                    "type":  "integer",
                                                                    "description":  "Max result length; -1 for default."
                                                                }
                                       },
                        "required":  [
                                         "name_path_pattern"
                                     ],
                        "title":  "applyArguments"
                    },
    "get_current_config":  {
                               "type":  "object",
                               "properties":  {

                                              },
                               "title":  "applyArguments"
                           },
    "get_diagnostics_for_file":  {
                                     "type":  "object",
                                     "properties":  {
                                                        "relative_path":  {
                                                                              "title":  "Relative Path",
                                                                              "type":  "string",
                                                                              "description":  "The relative path to the file to inspect."
                                                                          },
                                                        "start_line":  {
                                                                           "default":  0,
                                                                           "title":  "Start Line",
                                                                           "type":  "integer",
                                                                           "description":  "The first 0-based line to include. Defaults to 0."
                                                                       },
                                                        "end_line":  {
                                                                         "default":  -1,
                                                                         "title":  "End Line",
                                                                         "type":  "integer",
                                                                         "description":  "The last 0-based line to include. Defaults to -1, which means until the end of the file."
                                                                     },
                                                        "min_severity":  {
                                                                             "default":  4,
                                                                             "title":  "Min Severity",
                                                                             "type":  "integer",
                                                                             "description":  "Minimum LSP severity to include, where 1=Error, 2=Warning, 3=Information, 4=Hint.\nDiagnostics with lower-or-equal numeric severity are returned."
                                                                         },
                                                        "max_answer_chars":  {
                                                                                 "default":  -1,
                                                                                 "title":  "Max Answer Chars",
                                                                                 "type":  "integer",
                                                                                 "description":  "Max result length; -1 for default."
                                                                             }
                                                    },
                                     "required":  [
                                                      "relative_path"
                                                  ],
                                     "title":  "applyArguments"
                                 },
    "get_symbols_overview":  {
                                 "type":  "object",
                                 "properties":  {
                                                    "relative_path":  {
                                                                          "title":  "Relative Path",
                                                                          "type":  "string",
                                                                          "description":  "The relative path to the file to get the overview of."
                                                                      },
                                                    "depth":  {
                                                                  "default":  -1,
                                                                  "title":  "Depth",
                                                                  "type":  "integer",
                                                                  "description":  "Depth up to which descendants shall be retrieved.\nDefault (-1) results in a language specific choice: 1 for java and kotlin and 0 for other languages."
                                                              },
                                                    "max_answer_chars":  {
                                                                             "default":  -1,
                                                                             "title":  "Max Answer Chars",
                                                                             "type":  "integer",
                                                                             "description":  "If the overview is longer than this number of characters,\nno content will be returned. -1 means the default value from the config will be used.\nDon\u0027t adjust unless there is really no other way to get the content required for the task."
                                                                         }
                                                },
                                 "required":  [
                                                  "relative_path"
                                              ],
                                 "title":  "applyArguments"
                             },
    "initial_instructions":  {
                                 "type":  "object",
                                 "properties":  {

                                                },
                                 "title":  "applyArguments"
                             },
    "insert_after_symbol":  {
                                "type":  "object",
                                "properties":  {
                                                   "name_path":  {
                                                                     "title":  "Name Path",
                                                                     "type":  "string",
                                                                     "description":  "Name path of the symbol after which to insert content."
                                                                 },
                                                   "relative_path":  {
                                                                         "title":  "Relative Path",
                                                                         "type":  "string",
                                                                         "description":  "The relative path to the file containing the symbol."
                                                                     },
                                                   "body":  {
                                                                "title":  "Body",
                                                                "type":  "string",
                                                                "description":  "The body/content to be inserted. The inserted code shall begin with the next line after\nthe symbol."
                                                            }
                                               },
                                "required":  [
                                                 "name_path",
                                                 "relative_path",
                                                 "body"
                                             ],
                                "title":  "applyArguments"
                            },
    "insert_before_symbol":  {
                                 "type":  "object",
                                 "properties":  {
                                                    "name_path":  {
                                                                      "title":  "Name Path",
                                                                      "type":  "string",
                                                                      "description":  "Name path of the symbol before which to insert content."
                                                                  },
                                                    "relative_path":  {
                                                                          "title":  "Relative Path",
                                                                          "type":  "string",
                                                                          "description":  "The relative path to the file containing the symbol."
                                                                      },
                                                    "body":  {
                                                                 "title":  "Body",
                                                                 "type":  "string",
                                                                 "description":  "The body/content to be inserted before the line in which the referenced symbol is defined."
                                                             }
                                                },
                                 "required":  [
                                                  "name_path",
                                                  "relative_path",
                                                  "body"
                                              ],
                                 "title":  "applyArguments"
                             },
    "list_dir":  {
                     "type":  "object",
                     "properties":  {
                                        "relative_path":  {
                                                              "title":  "Relative Path",
                                                              "type":  "string",
                                                              "description":  "The relative path to the directory to list; pass \".\" to scan the project root."
                                                          },
                                        "recursive":  {
                                                          "title":  "Recursive",
                                                          "type":  "boolean",
                                                          "description":  "Whether to scan subdirectories recursively."
                                                      },
                                        "skip_ignored_files":  {
                                                                   "default":  false,
                                                                   "title":  "Skip Ignored Files",
                                                                   "type":  "boolean",
                                                                   "description":  "Whether to skip files and directories that are ignored."
                                                               },
                                        "max_answer_chars":  {
                                                                 "default":  -1,
                                                                 "title":  "Max Answer Chars",
                                                                 "type":  "integer",
                                                                 "description":  "If the output is longer than this number of characters,\nno content will be returned. -1 means the default value from the config will be used.\nDon\u0027t adjust unless there is really no other way to get the content required for the task."
                                                             }
                                    },
                     "required":  [
                                      "relative_path",
                                      "recursive"
                                  ],
                     "title":  "applyArguments"
                 },
    "read_file":  {
                      "type":  "object",
                      "properties":  {
                                         "relative_path":  {
                                                               "title":  "Relative Path",
                                                               "type":  "string",
                                                               "description":  "The relative path to the file to read."
                                                           },
                                         "start_line":  {
                                                            "default":  0,
                                                            "title":  "Start Line",
                                                            "type":  "integer",
                                                            "description":  "The 0-based index of the first line to be retrieved, negative values count from the end of the file."
                                                        },
                                         "end_line":  {
                                                          "anyOf":  [
                                                                        {
                                                                            "type":  "integer"
                                                                        },
                                                                        {
                                                                            "type":  "null"
                                                                        }
                                                                    ],
                                                          "default":  null,
                                                          "title":  "End Line",
                                                          "description":  "The 0-based index of the last line to be retrieved (inclusive). If None, read until the end of the file."
                                                      },
                                         "max_answer_chars":  {
                                                                  "default":  -1,
                                                                  "title":  "Max Answer Chars",
                                                                  "type":  "integer",
                                                                  "description":  "If the file (chunk) is longer than this number of characters,\nno content will be returned. Don\u0027t adjust unless there is really no other way to get the content\nrequired for the task."
                                                              }
                                     },
                      "required":  [
                                       "relative_path"
                                   ],
                      "title":  "applyArguments"
                  },
    "rename_symbol":  {
                          "type":  "object",
                          "properties":  {
                                             "name_path":  {
                                                               "title":  "Name Path",
                                                               "type":  "string",
                                                               "description":  "Name path of the symbol to rename."
                                                           },
                                             "relative_path":  {
                                                                   "title":  "Relative Path",
                                                                   "type":  "string",
                                                                   "description":  "The relative path to the file containing the symbol to rename."
                                                               },
                                             "new_name":  {
                                                              "title":  "New Name",
                                                              "type":  "string",
                                                              "description":  "The new name for the symbol."
                                                          }
                                         },
                          "required":  [
                                           "name_path",
                                           "relative_path",
                                           "new_name"
                                       ],
                          "title":  "applyArguments"
                      },
    "replace_content":  {
                            "type":  "object",
                            "properties":  {
                                               "relative_path":  {
                                                                     "title":  "Relative Path",
                                                                     "type":  "string",
                                                                     "description":  "The relative path to the file."
                                                                 },
                                               "needle":  {
                                                              "title":  "Needle",
                                                              "type":  "string",
                                                              "description":  "The string or regex pattern to search for.\nIf `mode` is \"literal\", this string will be matched exactly.\nIf `mode` is \"regex\", this string will be treated as a regular expression (syntax of Python\u0027s `re` module,\nwith flags DOTALL and MULTILINE enabled)."
                                                          },
                                               "repl":  {
                                                            "title":  "Repl",
                                                            "type":  "string",
                                                            "description":  "The replacement string (verbatim).\nIf mode is \"regex\", the string can contain backreferences to matched groups in the needle regex,\nspecified using the syntax $!1, $!2, etc. for groups 1, 2, etc."
                                                        },
                                               "mode":  {
                                                            "enum":  [
                                                                         "literal",
                                                                         "regex"
                                                                     ],
                                                            "title":  "Mode",
                                                            "type":  "string",
                                                            "description":  "Either \"literal\" or \"regex\", specifying how the `needle` parameter is to be interpreted."
                                                        },
                                               "allow_multiple_occurrences":  {
                                                                                  "default":  false,
                                                                                  "title":  "Allow Multiple Occurrences",
                                                                                  "type":  "boolean",
                                                                                  "description":  "Whether to allow matching and replacing multiple occurrences.\nIf false and multiple occurrences are found, an error will be returned."
                                                                              }
                                           },
                            "required":  [
                                             "relative_path",
                                             "needle",
                                             "repl",
                                             "mode"
                                         ],
                            "title":  "applyArguments"
                        },
    "replace_in_files":  {
                             "type":  "object",
                             "properties":  {
                                                "needle":  {
                                                               "title":  "Needle",
                                                               "type":  "string",
                                                               "description":  "The string (mode \"literal\") or regular expression (mode \"regex\"; Python `re`\nsyntax with DOTALL and MULTILINE) to search for."
                                                           },
                                                "repl":  {
                                                             "title":  "Repl",
                                                             "type":  "string",
                                                             "description":  "The replacement string. In regex mode, backreferences to matched groups can be\nspecified as $!1, $!2, etc."
                                                         },
                                                "mode":  {
                                                             "enum":  [
                                                                          "literal",
                                                                          "regex"
                                                                      ],
                                                             "title":  "Mode",
                                                             "type":  "string",
                                                             "description":  "Either \"literal\" or \"regex\", specifying how `needle` is to be interpreted."
                                                         },
                                                "relative_path":  {
                                                                      "default":  "",
                                                                      "title":  "Relative Path",
                                                                      "type":  "string",
                                                                      "description":  "Only consider this file or directory (default: the whole project)."
                                                                  },
                                                "paths_include_glob":  {
                                                                           "default":  "",
                                                                           "title":  "Paths Include Glob",
                                                                           "type":  "string",
                                                                           "description":  "Optional glob (relative to the project root, e.g. \"src/**/*.java\")\nrestricting which files are considered."
                                                                       },
                                                "paths_exclude_glob":  {
                                                                           "default":  "",
                                                                           "title":  "Paths Exclude Glob",
                                                                           "type":  "string",
                                                                           "description":  "Optional glob of files to exclude; takes precedence over the include glob."
                                                                       },
                                                "dry_run":  {
                                                                "default":  false,
                                                                "title":  "Dry Run",
                                                                "type":  "boolean",
                                                                "description":  "If True, do not modify anything; return the prospective changes as a list of\ndiffs with occurrence ids."
                                                            },
                                                "occurrence_ids":  {
                                                                       "anyOf":  [
                                                                                     {
                                                                                         "items":  {
                                                                                                       "type":  "string"
                                                                                                   },
                                                                                         "type":  "array"
                                                                                     },
                                                                                     {
                                                                                         "type":  "null"
                                                                                     }
                                                                                 ],
                                                                       "default":  null,
                                                                       "title":  "Occurrence Ids",
                                                                       "description":  "Optional list of occurrence ids (obtained from a dry run) to which the\nreplacement is restricted; if any id is unknown or stale, NOTHING is changed. If omitted,\nall occurrences are replaced."
                                                                   },
                                                "expected_count":  {
                                                                       "default":  -1,
                                                                       "title":  "Expected Count",
                                                                       "type":  "integer",
                                                                       "description":  "Optional guard for calls without occurrence_ids: the number of\noccurrences you expect to be replaced. If the actual count differs, nothing is changed and\nthe list of prospective changes is returned. -1 disables the guard."
                                                                   },
                                                "max_answer_chars":  {
                                                                         "default":  -1,
                                                                         "title":  "Max Answer Chars",
                                                                         "type":  "integer",
                                                                         "description":  "If the output exceeds this many characters, a shortened version is\nreturned. -1 uses the configured default."
                                                                     }
                                            },
                             "required":  [
                                              "needle",
                                              "repl",
                                              "mode"
                                          ],
                             "title":  "applyArguments"
                         },
    "replace_symbol_body":  {
                                "type":  "object",
                                "properties":  {
                                                   "name_path":  {
                                                                     "title":  "Name Path",
                                                                     "type":  "string",
                                                                     "description":  "Name path of the symbol whose body to replace."
                                                                 },
                                                   "relative_path":  {
                                                                         "title":  "Relative Path",
                                                                         "type":  "string",
                                                                         "description":  "The relative path to the file containing the symbol."
                                                                     },
                                                   "body":  {
                                                                "title":  "Body",
                                                                "type":  "string",
                                                                "description":  "The new symbol body. The symbol body is the definition of a symbol\nin the programming language, including e.g. the signature line for functions.\nDepending on the language, it may or may not include a preceding docstring or other preceding annotations."
                                                            }
                                               },
                                "required":  [
                                                 "name_path",
                                                 "relative_path",
                                                 "body"
                                             ],
                                "title":  "applyArguments"
                            },
    "safe_delete_symbol":  {
                               "type":  "object",
                               "properties":  {
                                                  "name_path_pattern":  {
                                                                            "title":  "Name Path Pattern",
                                                                            "type":  "string",
                                                                            "description":  "Name path of the symbol to delete."
                                                                        },
                                                  "relative_path":  {
                                                                        "title":  "Relative Path",
                                                                        "type":  "string",
                                                                        "description":  "The relative path to the file containing the symbol to delete."
                                                                    }
                                              },
                               "required":  [
                                                "name_path_pattern",
                                                "relative_path"
                                            ],
                               "title":  "applyArguments"
                           },
    "search_for_pattern":  {
                               "type":  "object",
                               "properties":  {
                                                  "substring_pattern":  {
                                                                            "title":  "Substring Pattern",
                                                                            "type":  "string",
                                                                            "description":  "Regular expression to search for."
                                                                        },
                                                  "context_lines_before":  {
                                                                               "default":  0,
                                                                               "title":  "Context Lines Before",
                                                                               "type":  "integer",
                                                                               "description":  "Number of context lines to include before each match."
                                                                           },
                                                  "context_lines_after":  {
                                                                              "default":  0,
                                                                              "title":  "Context Lines After",
                                                                              "type":  "integer",
                                                                              "description":  "Number of context lines to include after each match."
                                                                          },
                                                  "paths_include_glob":  {
                                                                             "default":  "",
                                                                             "title":  "Paths Include Glob",
                                                                             "type":  "string",
                                                                             "description":  "Optional glob (relative to project root, e.g. ``\"src/**/*.ts\"``) restricting which files are searched."
                                                                         },
                                                  "paths_exclude_glob":  {
                                                                             "default":  "",
                                                                             "title":  "Paths Exclude Glob",
                                                                             "type":  "string",
                                                                             "description":  "Optional glob to exclude files; takes precedence over `paths_include_glob`."
                                                                         },
                                                  "relative_path":  {
                                                                        "default":  "",
                                                                        "title":  "Relative Path",
                                                                        "type":  "string",
                                                                        "description":  "Restricts the search to this file or subdirectory of the project root."
                                                                    },
                                                  "restrict_search_to_code_files":  {
                                                                                        "default":  false,
                                                                                        "title":  "Restrict Search To Code Files",
                                                                                        "type":  "boolean",
                                                                                        "description":  "Whether to search only (non-ignored) files containing analyzable code symbols\n(useful when looking for class/method definitions); otherwise also search non-code files."
                                                                                    },
                                                  "skip_ignored_files":  {
                                                                             "default":  true,
                                                                             "title":  "Skip Ignored Files",
                                                                             "type":  "boolean",
                                                                             "description":  "Whether to skip ignored sub-paths (default: True)."
                                                                         },
                                                  "multiline":  {
                                                                    "default":  true,
                                                                    "title":  "Multiline",
                                                                    "type":  "boolean",
                                                                    "description":  "Whether to apply multi-line matching (default: True), enabling the flags re.DOTALL and re.MULTILINE."
                                                                },
                                                  "max_answer_chars":  {
                                                                           "default":  -1,
                                                                           "title":  "Max Answer Chars",
                                                                           "type":  "integer",
                                                                           "description":  "If the output exceeds this many characters, a progressively shortened summary is returned instead.\n``-1`` uses the configured default."
                                                                       }
                                              },
                               "required":  [
                                                "substring_pattern"
                                            ],
                               "title":  "applyArguments"
                           }
} as const);

export const SERENA_ENGINE_MANIFEST = Object.freeze({
  engine: 'serena' as const,
  packageName: 'serena-agent',
  version: '1.7.0',
  upstreamCommit: '949a27ef1e5fda1a6e7b561e777bcece345c6ffd',
  wheelSha256: '6dbf1459670d96fb0595f84932adef34260a6fe14ba5135b901fdb3c8c76e891',
  pythonVersion: '3.13',
  transport: 'stdio' as const,
  languageBackend: 'LSP' as const,
  context: 'desktop-app',
  modes: Object.freeze(['no-memories'] as const),
  expectedToolNames: Object.freeze([
    'activate_project',
    'create_text_file',
    'execute_shell_command',
    'find_declaration',
    'find_file',
    'find_implementations',
    'find_referencing_symbols',
    'find_symbol',
    'get_current_config',
    'get_diagnostics_for_file',
    'get_symbols_overview',
    'initial_instructions',
    'insert_after_symbol',
    'insert_before_symbol',
    'list_dir',
    'read_file',
    'rename_symbol',
    'replace_content',
    'replace_in_files',
    'replace_symbol_body',
    'safe_delete_symbol',
    'search_for_pattern',
  ] as const),
  expectedToolInputSchemas: SERENA_EXPECTED_TOOL_INPUT_SCHEMAS,
});

export type SerenaExpectedToolName = (typeof SERENA_ENGINE_MANIFEST.expectedToolNames)[number];
