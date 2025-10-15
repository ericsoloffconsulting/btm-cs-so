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
    isDynamic: true  // CRITICAL: Required for apply sublist manipulation
});
```

### Dynamic Mode vs. Standard Mode - Critical Distinction

#### When to Use Dynamic Mode (`isDynamic: true`)
- **Required for sublist manipulation**: When you need to modify apply sublist amounts or selections
- **Enables current line methods**: Provides access to `selectLine()`, `getCurrentSublistValue()`, `setCurrentSublistValue()`, `commitLine()`
- **Use Case**: Partial payment application, custom amount application, multi-invoice payment scenarios

#### When to Use Standard Mode (`isDynamic: false` or omitted)
- **Simple field updates**: When only setting header fields without sublist changes
- **Bulk operations**: Better performance for operations that don't require line-by-line interaction
- **Use Case**: Loading records to read values, simple field updates via `submitFields()`

### Apply Sublist Manipulation in Dynamic Mode - Critical Pattern

**Key Insight**: When transforming an invoice to a payment in dynamic mode, NetSuite automatically:
1. Populates the apply sublist with available open transactions
2. Pre-selects and applies the full amount to the source invoice
3. Requires dynamic mode methods (`selectLine`, `getCurrentSublistValue`, etc.) to modify line values

#### Correct Dynamic Mode Pattern for Custom Amount Application

```javascript
// After transforming invoice to payment with isDynamic: true

// STEP 1: Set payment header amount FIRST
// This establishes the total amount available for application
paymentRecord.setValue({
    fieldId: 'payment',
    value: customAmount
});

// STEP 2: Locate and modify the apply sublist line
var applyLineCount = paymentRecord.getLineCount({
    sublistId: 'apply'
});

var foundInvoice = false;
for (var line = 0; line < applyLineCount; line++) {
    // DYNAMIC MODE: Select the line before reading/writing
    paymentRecord.selectLine({
        sublistId: 'apply',
        line: line
    });

    // DYNAMIC MODE: Use getCurrentSublistValue to read
    var docId = paymentRecord.getCurrentSublistValue({
        sublistId: 'apply',
        fieldId: 'doc'
    });

    if (parseInt(docId, 10) === parseInt(targetInvoiceId, 10)) {
        foundInvoice = true;

        // DYNAMIC MODE: Use setCurrentSublistValue to write
        paymentRecord.setCurrentSublistValue({
            sublistId: 'apply',
            fieldId: 'apply',
            value: true
        });

        paymentRecord.setCurrentSublistValue({
            sublistId: 'apply',
            fieldId: 'amount',
            value: customAmount
        });

        // CRITICAL: Commit the line to save changes
        paymentRecord.commitLine({
            sublistId: 'apply'
        });

        break;
    }
}
```

### Standard Mode vs Dynamic Mode - Method Differences

| Operation | Standard Mode (`isDynamic: false`) | Dynamic Mode (`isDynamic: true`) |
|-----------|-----------------------------------|----------------------------------|
| **Read sublist value** | `getSublistValue({sublistId, fieldId, line})` | `selectLine({sublistId, line})`<br/>`getCurrentSublistValue({sublistId, fieldId})` |
| **Write sublist value** | `setSublistValue({sublistId, fieldId, line, value})` | `selectLine({sublistId, line})`<br/>`setCurrentSublistValue({sublistId, fieldId, value})`<br/>`commitLine({sublistId})` |
| **Add new line** | `insertLine({sublistId, line})` | `selectNewLine({sublistId})` |
| **Remove line** | `removeLine({sublistId, line})` | `removeLine({sublistId, line})` (same) |
| **Performance** | Faster for bulk operations | Slower but provides validation |
| **Use Case** | Simple read/write operations | Interactive line-by-line modifications |

### Common Pitfalls to Avoid

1. **Don't mix standard and dynamic mode methods**
   ```javascript
   // WRONG: Using standard mode method on dynamic record
   paymentRecord.setSublistValue({
       sublistId: 'apply',
       fieldId: 'amount',
       line: 0,
       value: amount
   }); // Will fail with "setSublistValue is not a function"

   // CORRECT: Use dynamic mode methods
   paymentRecord.selectLine({sublistId: 'apply', line: 0});
   paymentRecord.setCurrentSublistValue({
       sublistId: 'apply',
       fieldId: 'amount',
       value: amount
   });
   paymentRecord.commitLine({sublistId: 'apply'});
   ```

2. **Don't forget `commitLine()` in dynamic mode**
   - Changes to sublist lines are not saved until `commitLine()` is called
   - This is the most common cause of "changes not applied" issues

3. **Don't assume apply sublist exists**
   - Always check `getLineCount()` before attempting manipulation
   - Newly created payments may have empty apply sublists

4. **Set payment header amount BEFORE modifying apply lines**
   - NetSuite validates that applied amounts don't exceed payment amount
   - Setting header amount first prevents validation errors

5. **Use correct field names**
   - Use `'doc'` field for internal ID matching, not `'internalid'`
   - Field names are case-sensitive

### Transform Behavior - Automatic Apply Selection

When you transform an invoice to a payment:
- **Auto-population**: NetSuite populates the apply sublist with ALL open transactions for that customer
- **Auto-selection**: The source invoice is automatically checked for application
- **Auto-amount**: The full invoice balance is set as the apply amount
- **Result**: If you don't modify the apply sublist, the payment will apply the full invoice amount

**To apply a custom (partial) amount**:
1. Set the payment header amount to your custom amount
2. Find the invoice line in the apply sublist
3. Update the apply amount to match your payment amount
4. Any difference becomes "unapplied" on the payment

### Complete Working Example - Partial Payment Application

```javascript
// Find and transform invoice to payment
var invoiceId = findInvoiceByNumber(customerId, invoiceNumber);
var paymentRecord = record.transform({
    fromType: record.Type.INVOICE,
    fromId: invoiceId,
    toType: record.Type.CUSTOMER_PAYMENT,
    isDynamic: true  // REQUIRED for apply manipulation
});

// Set payment header fields
paymentRecord.setValue({fieldId: 'trandate', value: new Date()});
paymentRecord.setValue({fieldId: 'paymentmethod', value: 12}); // ACH
paymentRecord.setValue({fieldId: 'memo', value: 'Partial payment'});

// CRITICAL: Set payment amount BEFORE modifying apply
var customAmount = 1000.00; // Partial amount (invoice may be $5000)
paymentRecord.setValue({fieldId: 'payment', value: customAmount});

// Modify apply sublist to match custom amount
var applyLineCount = paymentRecord.getLineCount({sublistId: 'apply'});

for (var line = 0; line < applyLineCount; line++) {
    paymentRecord.selectLine({sublistId: 'apply', line: line});
    
    var docId = paymentRecord.getCurrentSublistValue({
        sublistId: 'apply',
        fieldId: 'doc'
    });

    if (parseInt(docId, 10) === parseInt(invoiceId, 10)) {
        // Update the apply amount to match payment amount
        paymentRecord.setCurrentSublistValue({
            sublistId: 'apply',
            fieldId: 'amount',
            value: customAmount
        });

        // Commit changes to this line
        paymentRecord.commitLine({sublistId: 'apply'});
        break;
    }
}

// Save the payment
var paymentId = paymentRecord.save();
// Result: $1000 payment applied to invoice, $4000 remains on invoice
```

### Error Handling and Validation

```javascript
try {
    // Set payment amount
    paymentRecord.setValue({fieldId: 'payment', value: amountFloat});

    // Attempt to modify apply sublist
    var applyLineCount = paymentRecord.getLineCount({sublistId: 'apply'});
    
    if (applyLineCount === 0) {
        log.warning('No apply lines found', {
            invoiceId: invoiceId,
            message: 'Apply sublist is empty - payment will be unapplied'
        });
    } else {
        // Process apply sublist...
    }
} catch (applyError) {
    log.error('Error modifying apply sublist', {
        error: applyError.message,
        stack: applyError.stack,
        invoiceId: invoiceId,
        amount: amountFloat
    });
    // Continue - payment will still be created but may not be applied correctly
}
```

### Best Practices Summary

1. **Always use `isDynamic: true`** when transforming invoices to payments if you need to modify the apply amount
2. **Set payment header amount first** before modifying apply sublist
3. **Use dynamic mode methods consistently** - don't mix with standard mode methods
4. **Always call `commitLine()`** after modifying a line in dynamic mode
5. **Check `getLineCount()`** before attempting sublist operations
6. **Log extensively** during development to understand sublist behavior
7. **Handle errors gracefully** - allow payment creation even if apply modification fails
8. **Test with various amounts** - full payment, partial payment, overpayment scenarios

### Performance Considerations

- **Dynamic mode is slower** than standard mode due to additional validation
- **Use standard mode** for bulk operations that don't require line interaction
- **Use dynamic mode** when you need to:
  - Modify sublist amounts
  - Apply custom payment amounts
  - Handle complex multi-line scenarios
  - Ensure field-level validation during entry
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