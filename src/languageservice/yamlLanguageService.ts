/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { YAMLSchemaService, CustomSchemaProvider, SchemaAdditions, SchemaDeletions } from './services/yamlSchemaService';
import {
  TextDocument,
  Position,
  CompletionList,
  Diagnostic,
  Hover,
  SymbolInformation,
  DocumentSymbol,
  TextEdit,
  DocumentLink,
} from 'vscode-languageserver-types';
import { JSONSchema } from './jsonSchema';
import { YAMLDocumentSymbols } from './services/documentSymbols';
import { YAMLCompletion } from './services/yamlCompletion';
import { YAMLHover } from './services/yamlHover';
import { YAMLValidation } from './services/yamlValidation';
import { YAMLFormatter } from './services/yamlFormatter';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { JSONDocument, DefinitionLink } from 'vscode-json-languageservice';
import { findLinks } from './services/yamlLinks';

export interface LanguageSettings {
  validate?: boolean; //Setting for whether we want to validate the schema
  hover?: boolean; //Setting for whether we want to have hover results
  completion?: boolean; //Setting for whether we want to have completion results
  format?: boolean; //Setting for whether we want to have the formatter or not
  isKubernetes?: boolean; //If true then its validating against kubernetes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schemas?: any[]; //List of schemas,
  customTags?: Array<string>; //Array of Custom Tags
  /**
   * Default indentation size
   */
  indentation?: string;
}

export interface WorkspaceContextService {
  resolveRelativePath(relativePath: string, resource: string): string;
}
/**
 * The schema request service is used to fetch schemas. The result should the schema file comment, or,
 * in case of an error, a displayable error string
 */
export interface SchemaRequestService {
  (uri: string): Promise<string>;
}

export interface SchemaConfiguration {
  /**
   * The URI of the schema, which is also the identifier of the schema.
   */
  uri: string;
  /**
   * A list of file names that are associated to the schema. The '*' wildcard can be used. For example '*.schema.json', 'package.json'
   */
  fileMatch?: string[];
  /**
   * The schema for the given URI.
   * If no schema is provided, the schema will be fetched with the schema request service (if available).
   */
  schema?: JSONSchema;
}

export interface CustomFormatterOptions {
  singleQuote?: boolean;
  bracketSpacing?: boolean;
  proseWrap?: string;
  printWidth?: number;
  enable?: boolean;
}

export interface LanguageService {
  configure(settings: LanguageSettings): void;
  registerCustomSchemaProvider(schemaProvider: CustomSchemaProvider): void;
  doComplete(document: TextDocument, position: Position, isKubernetes: boolean): Promise<CompletionList>;
  doValidation(document: TextDocument, isKubernetes: boolean): Promise<Diagnostic[]>;
  doHover(document: TextDocument, position: Position): Promise<Hover | null>;
  findDocumentSymbols(document: TextDocument): SymbolInformation[];
  findDocumentSymbols2(document: TextDocument): DocumentSymbol[];
  findDefinition(document: TextDocument, position: Position, doc: JSONDocument): Promise<DefinitionLink[]>;
  findLinks(document: TextDocument): Promise<DocumentLink[]>;
  resetSchema(uri: string): boolean;
  doFormat(document: TextDocument, options: CustomFormatterOptions): TextEdit[];
  addSchema(schemaID: string, schema: JSONSchema): void;
  deleteSchema(schemaID: string): void;
  modifySchemaContent(schemaAdditions: SchemaAdditions): void;
  deleteSchemaContent(schemaDeletions: SchemaDeletions): void;
}

export function getLanguageService(
  schemaRequestService: SchemaRequestService,
  workspaceContext: WorkspaceContextService
): LanguageService {
  const schemaService = new YAMLSchemaService(schemaRequestService, workspaceContext);
  const completer = new YAMLCompletion(schemaService);
  const hover = new YAMLHover(schemaService);
  const yamlDocumentSymbols = new YAMLDocumentSymbols(schemaService);
  const yamlValidation = new YAMLValidation(schemaService);
  const formatter = new YAMLFormatter();

  return {
    configure: (settings) => {
      schemaService.clearExternalSchemas();
      if (settings.schemas) {
        settings.schemas.forEach((settings) => {
          schemaService.registerExternalSchema(settings.uri, settings.fileMatch, settings.schema);
        });
      }
      yamlValidation.configure(settings);
      hover.configure(settings);
      const customTagsSetting = settings && settings['customTags'] ? settings['customTags'] : [];
      completer.configure(settings, customTagsSetting);
      formatter.configure(settings);
    },
    registerCustomSchemaProvider: (schemaProvider: CustomSchemaProvider) => {
      schemaService.registerCustomSchemaProvider(schemaProvider);
    },
    findDefinition: () => Promise.resolve([]),
    findLinks,
    doComplete: completer.doComplete.bind(completer),
    doValidation: yamlValidation.doValidation.bind(yamlValidation),
    doHover: hover.doHover.bind(hover),
    findDocumentSymbols: yamlDocumentSymbols.findDocumentSymbols.bind(yamlDocumentSymbols),
    findDocumentSymbols2: yamlDocumentSymbols.findHierarchicalDocumentSymbols.bind(yamlDocumentSymbols),
    resetSchema: (uri: string) => {
      return schemaService.onResourceChange(uri);
    },
    doFormat: formatter.format.bind(formatter),
    addSchema: (schemaID: string, schema: JSONSchema) => {
      return schemaService.saveSchema(schemaID, schema);
    },
    deleteSchema: (schemaID: string) => {
      return schemaService.deleteSchema(schemaID);
    },
    modifySchemaContent: (schemaAdditions: SchemaAdditions) => {
      return schemaService.addContent(schemaAdditions);
    },
    deleteSchemaContent: (schemaDeletions: SchemaDeletions) => {
      return schemaService.deleteContent(schemaDeletions);
    },
  };
}
