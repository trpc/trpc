Migrate the v11 docs plus site/blogs and all other content under www to fumadocs in a new www-2026 app directory. Keep the www directory so that site can be linked to/from.

v9 and v10 docs should remain in www, and when selected in the version picker under www-2026 the old site will be linked to. Likewise v11 in the old site should redirect to www-2026.

Keep the structure and content the same, ensure that all tools like shiki, algolia, etc continue to work. Ensure that old URLs either remain the same or are redirected appropriately.

Ensure that typechecking, linting, formatting, build, all pass before completing. Ensure that all docs are completely migrated before completing.
