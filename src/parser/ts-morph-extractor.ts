/**
 * ts-morph Symbol Extractor
 *
 * Comprehensive symbol extraction using ts-morph for TypeScript code analysis.
 * Extracts classes, functions, interfaces, types, variables, and more with
 * complete information including signatures, documentation, and location.
 */

import * as path from 'path';
import type {
  SourceFile,
  ClassDeclaration,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  EnumDeclaration,
  FunctionDeclaration,
  MethodDeclaration,
  PropertyDeclaration,
  VariableDeclaration,
  Node,
  MethodSignature,
  PropertySignature,
} from 'ts-morph';
import { getProject, createProject } from './ts-morph-project.js';

/** Symbol kind type matching existing definition */
export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'method'
  | 'property'
  | 'namespace'
  | 'module';

/** Extended symbol information with ts-morph capabilities */
export interface CodeSymbol {
  /** Symbol name */
  name: string;
  /** Symbol kind */
  kind: SymbolKind;
  /** File path where defined */
  filePath: string;
  /** Start line (1-based) */
  startLine: number;
  /** End line (1-based) */
  endLine: number;
  /** Start column (0-based) */
  startColumn: number;
  /** End column (0-based) */
  endColumn: number;
  /** Function/type signature */
  signature?: string;
  /** Documentation comment */
  documentation?: string;
  /** Whether symbol is exported */
  isExported: boolean;
  /** Whether symbol is default export */
  isDefaultExport: boolean;
  /** Modifiers (public, private, static, etc.) */
  modifiers: string[];
  /** Parent symbol name (for methods, nested classes) */
  parent?: string;
  /** Child symbols (methods, properties for classes) */
  children: CodeSymbol[];
  /** Type information */
  typeInfo?: TypeInfo;
}

/** Type information for symbols */
export interface TypeInfo {
  /** Type name */
  typeName: string;
  /** Type arguments for generics */
  typeArguments: string[];
  /** Base types (extends/implements) */
  baseTypes: string[];
  /** Implemented interfaces */
  implements: string[];
}

/** Import information */
export interface ImportInfo {
  /** Module specifier */
  moduleSpecifier: string;
  /** Named imports */
  namedImports: string[];
  /** Default import name */
  defaultImport?: string;
  /** Namespace import */
  namespaceImport?: string;
  /** Resolved absolute path if available */
  resolvedPath?: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
}

/** Export information */
export interface ExportInfo {
  /** Exported name */
  name: string;
  /** Whether it's a default export */
  isDefault: boolean;
  /** Original name if renamed */
  originalName?: string;
  /** Module specifier if re-exporting */
  moduleSpecifier?: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
}

/** Enhanced parse result */
export interface EnhancedParseResult {
  /** Original source file object */
  sourceFile: SourceFile;
  /** Extracted symbols */
  symbols: CodeSymbol[];
  /** Import information */
  imports: ImportInfo[];
  /** Export information */
  exports: ExportInfo[];
  /** File path */
  filePath: string;
  /** Source code */
  source: string;
}

/**
 * ts-morph based symbol extractor
 */
export class TsMorphSymbolExtractor {
  private project;

  /**
   * Create a new TsMorphSymbolExtractor
   * @param tsConfigPath Optional path to tsconfig.json
   */
  constructor(tsConfigPath?: string) {
    this.project = tsConfigPath ? createProject(tsConfigPath) : getProject();
  }

  /**
   * Parse a single file and return enhanced result
   * @param filePath Absolute file path
   * @param source Optional source code (creates in-memory file)
   */
  async parseFile(filePath: string, source?: string): Promise<EnhancedParseResult> {
    let sourceFile: SourceFile;

    if (source) {
      // Create in-memory source file
      sourceFile = this.project.createSourceFile(filePath, source, {
        overwrite: true,
      });
    } else {
      // Load from disk
      try {
        sourceFile = this.project.addSourceFileAtPath(filePath);
      } catch {
        // File might already exist in project
        sourceFile = this.project.getSourceFile(filePath)!;
      }
    }

    const symbols = this.extractFromSourceFile(sourceFile);
    const imports = this.extractImports(sourceFile);
    const exports = this.extractExports(sourceFile);

    return {
      sourceFile,
      symbols,
      imports,
      exports,
      filePath: path.normalize(sourceFile.getFilePath()),
      source: sourceFile.getFullText(),
    };
  }

  /**
   * Extract all symbols from a source file
   */
  extractFromSourceFile(sourceFile: SourceFile): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const filePath = path.normalize(sourceFile.getFilePath());

    // Extract classes
    for (const classDecl of sourceFile.getClasses()) {
      symbols.push(this.extractClassSymbol(classDecl, filePath));
    }

    // Extract interfaces
    for (const iface of sourceFile.getInterfaces()) {
      symbols.push(this.extractInterfaceSymbol(iface, filePath));
    }

    // Extract type aliases
    for (const typeAlias of sourceFile.getTypeAliases()) {
      symbols.push(this.extractTypeAliasSymbol(typeAlias, filePath));
    }

    // Extract enums
    for (const enm of sourceFile.getEnums()) {
      symbols.push(this.extractEnumSymbol(enm, filePath));
    }

    // Extract functions
    for (const func of sourceFile.getFunctions()) {
      symbols.push(this.extractFunctionSymbol(func, filePath));
    }

    // Extract variables (top-level)
    for (const variable of sourceFile.getVariableDeclarations()) {
      symbols.push(this.extractVariableSymbol(variable, filePath));
    }

    return symbols;
  }

  /**
   * Extract class symbol with methods and properties
   */
  private extractClassSymbol(classDecl: ClassDeclaration, filePath: string): CodeSymbol {
    const name = classDecl.getName() || 'AnonymousClass';
    const children: CodeSymbol[] = [];

    // Extract methods
    for (const method of classDecl.getMethods()) {
      children.push(this.extractMethodSymbol(method, filePath, name));
    }

    // Extract properties
    for (const property of classDecl.getProperties()) {
      children.push(this.extractPropertySymbol(property, filePath, name));
    }

    // Build type info
    const baseTypes: string[] = [];
    const baseClass = classDecl.getBaseClass();
    const baseClassName = baseClass?.getName();
    if (baseClassName) {
      baseTypes.push(baseClassName);
    }

    const implementsTypes: string[] = [];
    for (const implemented of classDecl.getImplements()) {
      const typeText = implemented.getText();
      implementsTypes.push(typeText);
    }

    // Get position info safely
    const startLine = classDecl.getStartLineNumber();
    const endLine = classDecl.getEndLineNumber();

    return {
      name,
      kind: 'class',
      filePath,
      startLine,
      endLine,
      startColumn: 0,
      endColumn: 0,
      signature: this.getClassSignature(classDecl),
      documentation: this.getDocumentation(classDecl as unknown as { getJsDocs(): Array<{ getDescription(): string; getText(): string }> }),
      isExported: classDecl.isExported(),
      isDefaultExport: classDecl.isDefaultExport(),
      modifiers: this.getModifiers(classDecl as unknown as { getModifiers(): Array<{ getText(): string }> }),
      children,
      typeInfo: {
        typeName: name,
        typeArguments: this.getTypeArguments(classDecl),
        baseTypes,
        implements: implementsTypes,
      },
    };
  }

  /**
   * Extract interface symbol
   */
  private extractInterfaceSymbol(iface: InterfaceDeclaration, filePath: string): CodeSymbol {
    const name = iface.getName() || 'AnonymousInterface';
    const children: CodeSymbol[] = [];

    // Extract methods and properties
    for (const method of iface.getMethods()) {
      children.push(this.extractMethodSymbol(method, filePath, name));
    }
    for (const property of iface.getProperties()) {
      children.push(this.extractPropertySymbol(property, filePath, name));
    }

    const startLine = iface.getStartLineNumber();
    const endLine = iface.getEndLineNumber();

    return {
      name,
      kind: 'interface',
      filePath,
      startLine,
      endLine,
      startColumn: 0,
      endColumn: 0,
      signature: this.getInterfaceSignature(iface),
      documentation: this.getDocumentation(iface as unknown as { getJsDocs(): Array<{ getDescription(): string; getText(): string }> }),
      isExported: iface.isExported(),
      isDefaultExport: iface.isDefaultExport(),
      modifiers: this.getModifiers(iface as unknown as { getModifiers(): Array<{ getText(): string }> }),
      children,
      typeInfo: {
        typeName: name,
        typeArguments: this.getTypeArguments(iface),
        baseTypes: this.getExtendsTypes(iface),
        implements: [],
      },
    };
  }

  /**
   * Extract type alias symbol
   */
  private extractTypeAliasSymbol(typeAlias: TypeAliasDeclaration, filePath: string): CodeSymbol {
    const name = typeAlias.getName() || 'AnonymousType';
    const startLine = typeAlias.getStartLineNumber();
    const endLine = typeAlias.getEndLineNumber();

    return {
      name,
      kind: 'type',
      filePath,
      startLine,
      endLine,
      startColumn: 0,
      endColumn: 0,
      signature: this.getTypeAliasSignature(typeAlias),
      documentation: this.getDocumentation(typeAlias as unknown as { getJsDocs(): Array<{ getDescription(): string; getText(): string }> }),
      isExported: typeAlias.isExported(),
      isDefaultExport: typeAlias.isDefaultExport(),
      modifiers: this.getModifiers(typeAlias as unknown as { getModifiers(): Array<{ getText(): string }> }),
      children: [],
      typeInfo: {
        typeName: name,
        typeArguments: this.getTypeArguments(typeAlias),
        baseTypes: [],
        implements: [],
      },
    };
  }

  /**
   * Extract enum symbol
   */
  private extractEnumSymbol(enm: EnumDeclaration, filePath: string): CodeSymbol {
    const name = enm.getName() || 'AnonymousEnum';
    const startLine = enm.getStartLineNumber();
    const endLine = enm.getEndLineNumber();

    return {
      name,
      kind: 'enum',
      filePath,
      startLine,
      endLine,
      startColumn: 0,
      endColumn: 0,
      signature: this.getEnumSignature(enm),
      documentation: this.getDocumentation(enm as unknown as { getJsDocs(): Array<{ getDescription(): string; getText(): string }> }),
      isExported: enm.isExported(),
      isDefaultExport: enm.isDefaultExport(),
      modifiers: this.getModifiers(enm as unknown as { getModifiers(): Array<{ getText(): string }> }),
      children: [],
      typeInfo: {
        typeName: name,
        typeArguments: [],
        baseTypes: [],
        implements: [],
      },
    };
  }

  /**
   * Extract function symbol
   */
  private extractFunctionSymbol(func: FunctionDeclaration, filePath: string): CodeSymbol {
    const name = func.getName() || 'AnonymousFunction';
    const startLine = func.getStartLineNumber();
    const endLine = func.getEndLineNumber();

    return {
      name,
      kind: 'function',
      filePath,
      startLine,
      endLine,
      startColumn: 0,
      endColumn: 0,
      signature: this.getFunctionSignature(func),
      documentation: this.getDocumentation(func as unknown as { getJsDocs(): Array<{ getDescription(): string; getText(): string }> }),
      isExported: func.isExported(),
      isDefaultExport: func.isDefaultExport(),
      modifiers: this.getModifiers(func as unknown as { getModifiers(): Array<{ getText(): string }> }),
      children: [],
    };
  }

  /**
   * Extract method symbol
   */
  private extractMethodSymbol(
    method: MethodDeclaration | MethodSignature,
    filePath: string,
    parentName: string
  ): CodeSymbol {
    const name = method.getName() || 'AnonymousMethod';
    const startLine = method.getStartLineNumber();
    const endLine = method.getEndLineNumber();

    return {
      name,
      kind: 'method',
      filePath,
      startLine,
      endLine,
      startColumn: 0,
      endColumn: 0,
      signature: this.getMethodSignature(method),
      documentation: this.getDocumentation(method as unknown as { getJsDocs(): Array<{ getDescription(): string; getText(): string }> }),
      isExported: false,
      isDefaultExport: false,
      modifiers: this.getModifiers(method as unknown as { getModifiers(): Array<{ getText(): string }> }),
      parent: parentName,
      children: [],
    };
  }

  /**
   * Extract property symbol
   */
  private extractPropertySymbol(
    property: PropertyDeclaration | PropertySignature,
    filePath: string,
    parentName: string
  ): CodeSymbol {
    const name = property.getName() || 'AnonymousProperty';
    const startLine = property.getStartLineNumber();
    const endLine = property.getEndLineNumber();

    return {
      name,
      kind: 'property',
      filePath,
      startLine,
      endLine,
      startColumn: 0,
      endColumn: 0,
      signature: this.getPropertySignature(property),
      documentation: this.getDocumentation(property as unknown as { getJsDocs(): Array<{ getDescription(): string; getText(): string }> }),
      isExported: false,
      isDefaultExport: false,
      modifiers: this.getModifiers(property as unknown as { getModifiers(): Array<{ getText(): string }> }),
      parent: parentName,
      children: [],
    };
  }

  /**
   * Extract variable symbol
   */
  private extractVariableSymbol(variable: VariableDeclaration, filePath: string): CodeSymbol {
    const name = variable.getName() || 'AnonymousVariable';
    const startLine = variable.getStartLineNumber();
    const endLine = variable.getEndLineNumber();
    const isExported = this.isVariableExported(variable);

    return {
      name,
      kind: 'variable',
      filePath,
      startLine,
      endLine,
      startColumn: 0,
      endColumn: 0,
      signature: this.getVariableSignature(variable),
      documentation: undefined,
      isExported,
      isDefaultExport: false,
      modifiers: [],
      children: [],
    };
  }

  /**
   * Check if a variable is exported
   */
  private isVariableExported(variable: VariableDeclaration): boolean {
    const parent = variable.getParent();
    if (parent) {
      const grandParent = parent.getParent();
      if (grandParent) {
        try {
          if ('isExported' in grandParent) {
            return (grandParent as unknown as { isExported: () => boolean }).isExported();
          }
        } catch {
          // Ignore errors
        }
      }
    }
    return false;
  }

  /**
   * Extract imports from source file
   */
  private extractImports(sourceFile: SourceFile): ImportInfo[] {
    const imports: ImportInfo[] = [];

    for (const importDecl of sourceFile.getImportDeclarations()) {
      const namedImports: string[] = [];

      for (const namedImp of importDecl.getNamedImports()) {
        namedImports.push(namedImp.getName());
      }

      const defaultImport = importDecl.getDefaultImport()?.getText();
      const namespaceImport = importDecl.getNamespaceImport()?.getText();

      let resolvedPath: string | undefined;
      try {
        const resolved = importDecl.getModuleSpecifierSourceFile();
        if (resolved) {
          resolvedPath = path.normalize(resolved.getFilePath());
        }
      } catch {
        // Resolution failed
      }

      imports.push({
        moduleSpecifier: importDecl.getModuleSpecifierValue(),
        namedImports,
        defaultImport,
        namespaceImport,
        resolvedPath,
        startLine: importDecl.getStartLineNumber(),
        endLine: importDecl.getEndLineNumber(),
      });
    }

    return imports;
  }

  /**
   * Extract exports from source file
   */
  private extractExports(sourceFile: SourceFile): ExportInfo[] {
    const exports: ExportInfo[] = [];

    // Export declarations
    for (const exportDecl of sourceFile.getExportDeclarations()) {
      for (const namedExp of exportDecl.getNamedExports()) {
        exports.push({
          name: namedExp.getName(),
          isDefault: false,
          originalName: namedExp.getAliasNode()?.getText(),
          moduleSpecifier: exportDecl.getModuleSpecifierValue(),
          startLine: exportDecl.getStartLineNumber(),
          endLine: exportDecl.getEndLineNumber(),
        });
      }
    }

    // Default export
    const defaultExport = sourceFile.getDefaultExportSymbol();
    if (defaultExport) {
      const name = defaultExport.getName();
      if (name) {
        exports.push({
          name,
          isDefault: true,
          startLine: 0,
          endLine: 0,
        });
      }
    }

    return exports;
  }

  /**
   * Get documentation from a node
   */
  private getDocumentation(node: unknown): string | undefined {
    try {
      if (typeof node === 'object' && node !== null && 'getJsDocs' in node) {
        const jsDocs = (node as { getJsDocs(): Array<{ getDescription?: () => string; getText: () => string }> }).getJsDocs();
        if (jsDocs.length > 0) {
          const description = jsDocs[0].getDescription?.();
          if (description) return description.trim();
          return jsDocs[0].getText().trim();
        }
      }
    } catch {
      // Ignore errors
    }
    return undefined;
  }

  /**
   * Get modifiers from a node
   */
  private getModifiers(node: unknown): string[] {
    try {
      if (typeof node === 'object' && node !== null && 'getModifiers' in node) {
        const getModifiers = (node as { getModifiers: () => Array<{ getText: () => string }> }).getModifiers;
        return getModifiers().map((mod) => mod.getText());
      }
    } catch {
      // Ignore errors
    }
    return [];
  }

  /**
   * Get class signature
   */
  private getClassSignature(classDecl: ClassDeclaration): string {
    let signature = classDecl.getName() || 'class';

    // Add type parameters
    try {
      const typeParams = classDecl.getTypeParameters();
      if (typeParams.length > 0) {
        signature += `<${typeParams.map((t) => t.getText()).join(', ')}>`;
      }

      // Add extends
      const baseClass = classDecl.getBaseClass();
      if (baseClass?.getName()) {
        signature += ` extends ${baseClass.getName()}`;
      }

      // Add implements
      const implementsList = classDecl.getImplements();
      if (implementsList.length > 0) {
        signature += ` implements ${implementsList.map((i) => i.getText()).join(', ')}`;
      }
    } catch {
      // Ignore errors
    }

    return signature;
  }

  /**
   * Get interface signature
   */
  private getInterfaceSignature(iface: InterfaceDeclaration): string {
    let signature = iface.getName() || 'interface';

    try {
      // Add type parameters
      const typeParams = iface.getTypeParameters();
      if (typeParams.length > 0) {
        signature += `<${typeParams.map((t) => t.getText()).join(', ')}>`;
      }

      // Add extends
      const extendsList = iface.getExtends();
      if (extendsList.length > 0) {
        signature += ` extends ${extendsList.map((e) => e.getText()).join(', ')}`;
      }
    } catch {
      // Ignore errors
    }

    return signature;
  }

  /**
   * Get type alias signature
   */
  private getTypeAliasSignature(typeAlias: TypeAliasDeclaration): string {
    let signature = typeAlias.getName() || 'type';

    try {
      // Add type parameters
      const typeParams = typeAlias.getTypeParameters();
      if (typeParams.length > 0) {
        signature += `<${typeParams.map((t) => t.getText()).join(', ')}>`;
      }
    } catch {
      // Ignore errors
    }

    return signature;
  }

  /**
   * Get enum signature
   */
  private getEnumSignature(enm: EnumDeclaration): string {
    return enm.getName() || 'enum';
  }

  /**
   * Get function signature
   */
  private getFunctionSignature(func: FunctionDeclaration): string {
    const name = func.getName() || 'function';
    try {
      const params = func.getParameters().map((p) => p.getText());
      const returnType = func.getReturnTypeNode()?.getText();

      let signature = `${name}(${params.join(', ')})`;
      if (returnType) {
        signature += `: ${returnType}`;
      }
      return signature;
    } catch {
      return name;
    }
  }

  /**
   * Get method signature
   */
  private getMethodSignature(method: unknown): string {
    const name = this.getNodeName(method) || 'method';
    try {
      const node = method as unknown as {
        getParameters?: () => Array<{ getText: () => string }>;
        getReturnTypeNode?: () => { getText: () => string } | undefined;
      };
      const params = node.getParameters?.().map((p) => p.getText()) || [];
      const returnType = node.getReturnTypeNode?.()?.getText();

      let signature = `${name}(${params.join(', ')})`;
      if (returnType) {
        signature += `: ${returnType}`;
      }
      return signature;
    } catch {
      return name;
    }
  }

  /**
   * Get property signature
   */
  private getPropertySignature(property: unknown): string {
    const name = this.getNodeName(property) || 'property';
    try {
      const node = property as unknown as {
        getTypeNode?: () => { getText: () => string } | undefined;
      };
      const type = node.getTypeNode?.()?.getText();
      if (type) {
        return `${name}: ${type}`;
      }
    } catch {
      // Ignore errors
    }
    return name;
  }

  /**
   * Helper to get node name
   */
  private getNodeName(node: unknown): string | undefined {
    try {
      if (typeof node === 'object' && node !== null && 'getName' in node) {
        return (node as { getName?: () => string | undefined }).getName?.();
      }
    } catch {
      // Ignore errors
    }
    return undefined;
  }

  /**
   * Get variable signature
   */
  private getVariableSignature(variable: VariableDeclaration): string {
    const name = variable.getName() || 'variable';
    try {
      const type = variable.getTypeNode()?.getText();
      if (type) {
        return `${name}: ${type}`;
      }
    } catch {
      // Ignore errors
    }
    return name;
  }

  /**
   * Get type arguments from a node
   */
  private getTypeArguments<T extends Node>(node: T): string[] {
    try {
      if (typeof node === 'object' && node !== null && 'getTypeParameters' in node) {
        const getTypeParams = (node as { getTypeParameters: () => Array<{ getText: () => string }> }).getTypeParameters;
        const typeParams = getTypeParams();
        return typeParams.map((t) => t.getText());
      }
    } catch {
      // Ignore errors
    }
    return [];
  }

  /**
   * Get extends types from an interface
   */
  private getExtendsTypes(iface: InterfaceDeclaration): string[] {
    try {
      return iface.getExtends().map((e) => e.getText());
    } catch {
      return [];
    }
  }
}

/**
 * Convenience function to parse a single file
 */
export async function parseFileWithTsMorph(
  filePath: string,
  source?: string,
  tsConfigPath?: string
): Promise<EnhancedParseResult> {
  const extractor = new TsMorphSymbolExtractor(tsConfigPath);
  return extractor.parseFile(filePath, source);
}
