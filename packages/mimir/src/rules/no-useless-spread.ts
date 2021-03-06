import * as ts from 'typescript';
import { AbstractRule, Replacement, excludeDeclarationFiles } from '@fimbul/ymir';
import {
    WrappedAst,
    getWrappedNodeAtPosition,
    isArrayLiteralExpression,
    isOmittedExpression,
    isSpreadElement,
    isSpreadAssignment,
    isReassignmentTarget,
    isObjectLiteralExpression,
} from 'tsutils';

const FAILURE_STRING = 'Using the spread operator here is not necessary.';

@excludeDeclarationFiles
export class Rule extends AbstractRule {
    public apply() {
        const re = /\.{3}\s*[/[{]/g;
        let wrappedAst: WrappedAst | undefined;
        for (let match = re.exec(this.sourceFile.text); match !== null; match = re.exec(this.sourceFile.text)) {
            const { node } = getWrappedNodeAtPosition(
                wrappedAst || (wrappedAst = this.context.getWrappedAst()),
                match.index,
            )!;
            if (
                ((isSpreadElement(node) &&
                    isArrayLiteralExpression(node.expression) &&
                    (!node.expression.elements.some(isOmittedExpression) || isReassignmentTarget(node))) ||
                    (isSpreadAssignment(node) && isObjectLiteralExpression(node.expression))) &&
                node.expression.pos - 3 === match.index
            )
                this.addFailureAtNode(node, FAILURE_STRING, removeUselessSpread(node));
        }
    }
}

function removeUselessSpread(node: ts.SpreadElement | ts.SpreadAssignment): Replacement | Replacement[] {
    const list = isArrayLiteralExpression(node.expression)
        ? node.expression.elements
        : (<ts.ObjectLiteralExpression>node.expression).properties;

    /* Handles edge cases of spread on empty array literals */
    if (isSpreadElement(node) && isArrayLiteralExpression(node.expression) && list.length === 0)
        return removeUselessSpreadOfEmptyArray(node);

    const replacements = [
        Replacement.delete(node.getStart(), node.expression.getStart() + 1),
        Replacement.delete(node.expression.end - 1, node.expression.end),
    ];

    /* Check for trailing commas in array/obj literals */
    if (list.hasTrailingComma) replacements.push(Replacement.delete(list.end - 1, list.end));

    return replacements;
}

function removeUselessSpreadOfEmptyArray(node: ts.SpreadElement): Replacement {
    const parent = node.parent!;
    const list = parent.kind === ts.SyntaxKind.ArrayLiteralExpression ? parent.elements : parent.arguments!;
    const index = list.findIndex((listItem) => listItem === node);
    return Replacement.delete(node.pos, index === list.length - 1 ? list.end : list[index + 1].pos);
}
