# Development Preferences

## Code Changes
- Always provide complete function rewrites instead of partial snippets
- Include full function body with proper context and dependencies
- Use complete code blocks with file paths when suggesting changes

## AI Assistant Preferences
- **Ask Clarifying Questions:** When requirements or context are unclear, always ask clarifying questions before providing solutions
- **Error on the Side of Clarification:** It's better to ask for more details than to make assumptions about implementation requirements
- **Validate Understanding:** Confirm understanding of complex requirements before proceeding with code changes
- **Consider Edge Cases:** Ask about potential edge cases and error handling requirements when they're not explicitly specified

## JavaScript Syntax Compatibility
- NetSuite's JavaScript environment does not support ES6 template literals (backticks)
- Use string concatenation instead of template literals for multi-line strings
- Avoid modern JavaScript features - stick to ES5 syntax for NetSuite compatibility
- Example of what NOT to use: `cssText = \`background: ${color}; padding: ${size};\``
- Example of what TO use: `cssText = 'background: ' + color + '; padding: ' + size + ';'`

## Documentation Standards
- **JSDoc Comments Required**: All functions must include proper JSDoc documentation
- **Function JSDoc Format**:
  ```javascript
  /**
   * Brief description of what the function does
   * @param {type} paramName - Description of parameter
   * @param {type} paramName - Description of parameter
   * @returns {type} Description of return value
   */
  ```
- **Examples**:
  ```javascript
  /**
   * Find PLS PAY value in worksheet (search entire worksheet)
   * @param {Object} worksheet - XLSX worksheet object
   * @param {Object} range - Worksheet range
   * @returns {number} PLS PAY value or 0
   */
  ```
- **Benefits**: Enables IDE IntelliSense, improves code maintainability, follows NetSuite best practices

## Customer Payment Creation with Invoice Application - Best Practices

### Transform vs. Create Approach
- **Use `record.transform()` when applying to specific invoices**: Transform from invoice to payment automatically populates apply sublist
- **Use `record.create()` only for general payments**: When no specific invoice targeting is needed
- **Key Difference**: Transform pre-populates the apply sublist with available transactions; create requires manual population

### Record Transform Best Practices
```javascript
// Correct approach for invoice-specific payments
var paymentRecord = record.transform({
    fromType: record.Type.INVOICE,
    fromId: invoiceId,
    toType: record.Type.CUSTOMER_PAYMENT,
    isDynamic: true  // Required for apply sublist manipulation
});
```

### Apply Sublist Manipulation - Critical Steps
1. **Always Clear Auto-Selected Lines First**: Transform auto-selects the source invoice, clear all selections before applying your logic
2. **Use Proper Field Names**: Use `'doc'` field for internal ID matching, not `'internalid'`
3. **Set Both Apply Flag and Amount**: Must set both `'apply'` (boolean) and `'amount'` (number) fields
4. **Handle Errors Gracefully**: Wrap apply operations in try-catch blocks as NetSuite can be inconsistent

### Correct Apply Sublist Pattern
```javascript
// STEP 1: Clear all auto-selected apply lines
var applyLineCount = paymentRecord.getLineCount({
    sublistId: 'apply'
});

for (var clearLine = 0; clearLine < applyLineCount; clearLine++) {
    try {
        var isApplied = paymentRecord.getSublistValue({
            sublistId: 'apply',
            fieldId: 'apply',
            line: clearLine
        });

        if (isApplied) {
            paymentRecord.setSublistValue({
                sublistId: 'apply',
                fieldId: 'apply',
                line: clearLine,
                value: false
            });

            paymentRecord.setSublistValue({
                sublistId: 'apply',
                fieldId: 'amount',
                line: clearLine,
                value: 0
            });
        }
    } catch (clearError) {
        // Log but continue - some lines may not be clearable
        log.debug('Could not clear apply line', clearError.toString());
    }
}

// STEP 2: Find and select target invoice(s)
for (var line = 0; line < applyLineCount; line++) {
    var applyInternalId = paymentRecord.getSublistValue({
        sublistId: 'apply',
        fieldId: 'doc',  // Use 'doc' not 'internalid'
        line: line
    });

    if (parseInt(applyInternalId, 10) === parseInt(targetInvoiceId, 10)) {
        // Select this line for application
        paymentRecord.setSublistValue({
            sublistId: 'apply',
            fieldId: 'apply',
            line: line,
            value: true
        });

        // Set the amount to apply
        paymentRecord.setSublistValue({
            sublistId: 'apply',
            fieldId: 'amount',
            line: line,
            value: amountToApply
        });
        break;
    }
}
```

### Common Pitfalls to Avoid
- **Don't use `setSublistValue` on new payment records**: Only works after transform or when apply sublist is populated
- **Don't assume apply sublist exists**: Check line count before attempting manipulation
- **Don't skip the clear step**: Auto-selected lines can interfere with your intended applications
- **Don't use wrong field names**: `'doc'` field contains internal IDs, not `'internalid'`
- **Don't forget isDynamic: true**: Required for sublist manipulation

### Multiple Invoice Application Pattern
```javascript
// For applying to multiple invoices, iterate through target invoices
var targetInvoices = [
    { id: 12345, amount: 1000.00 },
    { id: 12346, amount: 500.00 }
];

for (var line = 0; line < applyLineCount; line++) {
    var applyInternalId = paymentRecord.getSublistValue({
        sublistId: 'apply',
        fieldId: 'doc',
        line: line
    });

    // Check if this line matches any target invoice
    for (var t = 0; t < targetInvoices.length; t++) {
        if (parseInt(applyInternalId, 10) === parseInt(targetInvoices[t].id, 10)) {
            paymentRecord.setSublistValue({
                sublistId: 'apply',
                fieldId: 'apply',
                line: line,
                value: true
            });

            paymentRecord.setSublistValue({
                sublistId: 'apply',
                fieldId: 'amount',
                line: line,
                value: targetInvoices[t].amount
            });
            break;
        }
    }
}
```

### Error Handling and Validation
- **Always validate invoice exists**: Use search to confirm invoice ID before transform
- **Provide fallback to record.create()**: If transform fails, create new payment without application
- **Log detailed information**: Include invoice IDs, amounts, and line numbers in debug logs
- **Handle partial applications**: Allow payment creation even if apply operations fail

### Credit Application (Advanced Pattern)
- **Use credit sublist for journal entries**: When applying credits from journal entries
- **Match credit and apply amounts**: Ensure credit amount equals apply amount for zero net effect
- **Consider temporary payment deletion**: For journal entry applications, payment record may be deleted after credit application

## Suitelet with Search Results Tables - Best Practices

### HTML Structure and Styling
- **Reset NetSuite Default Styles**: Always include CSS to override NetSuite's default form styling that creates unwanted borders
  ```javascript
  '.uir-page-title-secondline { border: none !important; margin: 0 !important; padding: 0 !important; }' +
  '.uir-record-type { border: none !important; }' +
  '.bglt { border: none !important; }' +
  '.smalltextnolink { border: none !important; }'
  ```
- **Use Semantic HTML**: Implement proper `<thead>` and `<tbody>` elements for accessibility and styling consistency
- **CSS Class-Based Styling**: Use specific CSS classes rather than inline styles for maintainability
- **Clean Container Structure**: Wrap content in a main container div to isolate from NetSuite's default styling

### Table Design Standards
- **Consistent Table Styling**: 
  - Use `border-collapse: collapse` for clean borders
  - Implement alternating row colors with `:nth-child(even)`
  - Add hover effects for better user experience
  - Use consistent padding (8px recommended)
- **Action Column**: Always place action buttons in the first column for easy access
- **Button Styling**: Create consistent action button styling with hover effects
- **Responsive Design**: Consider column widths and text wrapping for various screen sizes

### Search Result Implementation
- **Modular Function Design**: Separate HTML building into distinct functions:
  - `buildSearchResultsHTML()` for overall page structure
  - `buildSearchTable()` for individual table generation
  - Helper functions for data mapping and extraction
- **Error Handling**: Include comprehensive error handling for search loading and data processing
- **Result Count Display**: Always show result counts for user feedback
- **No Results Handling**: Provide clear messaging when searches return no results

### Data Mapping and Processing
- **Column Mapping by Label**: Use column labels rather than indexes for data extraction to handle search modifications
- **Type Conversion**: Always validate and convert data types (parseInt, parseFloat) before use
- **XSS Prevention**: Implement HTML escaping for all user-displayable content
- **Flexible Data Handling**: Account for missing or null values in search results

### Form Integration and Actions
- **Hidden Form Fields**: Use hidden inputs to pass data between requests
- **Confirmation Dialogs**: Implement JavaScript confirmations for destructive actions
- **POST/Redirect/GET Pattern**: Use redirects after POST operations to prevent duplicate submissions
- **Success/Error Messaging**: Implement clear feedback messaging system

### CSS Organization
- **Logical Grouping**: Group CSS rules by function (reset, container, table, buttons, messages)
- **Specificity Management**: Use specific class selectors to override NetSuite defaults
- **Color Consistency**: Define a consistent color palette for success/error states
- **Responsive Breakpoints**: Consider mobile and tablet viewports

### JavaScript Best Practices
- **Inline Scripts**: Keep JavaScript functions simple and inline for Suitelet compatibility
- **Event Handling**: Use onclick attributes for simple interactions
- **Function Naming**: Use descriptive function names that clearly indicate purpose
- **Fallback Handling**: Always provide fallback values for dynamic content

### Common Pitfalls to Avoid
- **Border Accumulation**: NetSuite adds multiple border layers - always reset with `!important`
- **Form Nesting**: Avoid nesting forms which can cause submission issues
- **Memory Leaks**: Don't store large objects in global variables
- **Search Limits**: Always handle the 4000 result limit in saved searches
- **Dynamic Content**: Escape all dynamic content to prevent XSS vulnerabilities