# Rule Execution Tests

Comprehensive integration tests for rule execution engine and database operations.

## Test Coverage

### 1. Direct Rule Tests (4 tests)
- String, number, and object value execution
- Basic value passthrough

### 2. Template Rule Tests (4 tests)
- Variable interpolation with `${variable}` syntax
- Fallback values with `${variable || 'fallback'}`
- Multiple variable substitution
- Empty context handling

### 3. Function Rule Tests (13 tests)
- Safe code execution
- Mathematical operations
- Array operations
- Security validation (require, import, eval, process, fetch, etc.)
- Access to array_index context variable
- Dangerous pattern detection

### 4. Conditional Rule Tests (6 tests)
- Equals operator
- Contains operator
- Matches operator (regex)
- Missing field handling (defaults to else)
- Nested conditional rules

### 5. Array Rule Tests (6 tests)
- Fixed count arrays
- Dynamic count from context
- Template elements with array_index
- Function elements accessing array_index
- Zero-count arrays
- Nested conditional elements

### 6. Reference Rule Tests (6 tests)
- Direct field access
- Nested object navigation
- Top-level fields
- Array element access
- Undefined path handling
- Context requirement validation

### 7. Error Handling Tests (7 tests)
- Invalid rule types
- Missing required properties
- Function execution failures
- Array validation
- Reference validation

### 8. Integration Tests (3 tests)
- Multi-type rule composition
- Complex nested rules
- Fallback chains

### 9. Edge Case Tests (5 tests)
- Empty strings and static text
- Boolean returns
- Deeply nested properties
- Complex expressions
- Null comparisons

### 10. Security Tests (6 tests)
- Dangerous pattern blocking
- Module access prevention
- Environment variable protection
- Pattern validation

## Running Tests

### Prerequisites
- Deno runtime installed
- No database connection required (all tests are unit tests)

### Run All Tests
```bash
deno test --allow-env supabase/functions/test/rules.test.ts
```

### Run Specific Test Category
```bash
# Direct rule tests
deno test --allow-env --filter "direct rule" supabase/functions/test/rules.test.ts

# Template rule tests
deno test --allow-env --filter "template rule" supabase/functions/test/rules.test.ts

# Function rule tests
deno test --allow-env --filter "function rule" supabase/functions/test/rules.test.ts

# Conditional rule tests
deno test --allow-env --filter "conditional rule" supabase/functions/test/rules.test.ts

# Array rule tests
deno test --allow-env --filter "array rule" supabase/functions/test/rules.test.ts

# Reference rule tests
deno test --allow-env --filter "reference rule" supabase/functions/test/rules.test.ts

# Security tests
deno test --allow-env --filter "Security" supabase/functions/test/rules.test.ts
```

### Run with Task
```bash
deno task test
```

## Test Structure

Each test module contains:

1. **Rule Execution Engine** - Implements the rule execution logic
   - `executeRule()` - Main execution function
   - `validateFunctionCode()` - Security validation for function rules
   - `evaluateCondition()` - Conditional logic evaluation
   - `parseTemplate()` - Template variable substitution
   - `getValueFromPath()` - Nested object access

2. **Test Cases** - Organized by rule type and feature

## Rule Types

### Direct Rule
```typescript
{
  type: "direct",
  value: "any literal value"
}
```

### Template Rule
```typescript
{
  type: "template",
  template: "Hello ${name || 'Guest'}"
}
```

### Function Rule
```typescript
{
  type: "function",
  function_code: "return responses['value'].toUpperCase();"
}
```

### Conditional Rule
```typescript
{
  type: "conditional",
  condition: {
    field: "status",
    operator: "equals|contains|matches",
    value: "target",
    then: { /* rule */ },
    else: { /* rule */ }
  }
}
```

### Array Rule
```typescript
{
  type: "array",
  count: 3,
  // OR
  count_source: "responses['count']",
  element_rule: { /* rule */ }
}
```

### Reference Rule
```typescript
{
  type: "reference",
  source_field: "path.to.field[0].property"
}
```

## Context Object

Rules execute with a context object:

```typescript
interface RuleContext {
  responses?: Record<string, any>  // User input data
  masterJson?: any                 // Reference master JSON
  array_index?: number             // Current array element index
}
```

## Security Features

Function rules are validated to prevent:
- `require()` statements
- `import` statements
- `eval()` calls
- `Function` constructor
- `process.*` access
- `child_process` module
- `fs.*` access
- `fetch()` calls
- `XMLHttpRequest`
- `global.*` or `window.*` access

## Notes

- All tests are unit tests (no external dependencies)
- Template interpolation supports fallback syntax: `${var || 'default'}`
- Conditional operators: `equals`, `contains`, `matches` (regex)
- Array elements receive `array_index` in context
- Reference paths support nested objects and array indexing
- Function code runs in a sandboxed function context

## Future Enhancements

- Database integration tests with test fixtures
- Performance benchmarks
- Stress tests with large arrays
- Complex nested structure tests
- Template escaping and special character handling
