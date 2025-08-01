/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import request from '../shared/request'
import { ApplicationComposer } from './composerWebview'
import { isLocalDev, localhost, cdn } from './constants'
import { getLogger } from '../shared/logger/logger'

const localize = nls.loadMessageBundle()

const enabledFeatures = ['ide-only', 'anything-resource', 'sfnV2', 'starling']

export class ApplicationComposerManager {
    protected readonly name: string = 'ApplicationComposerManager'

    protected readonly managedVisualizations = new Map<string, ApplicationComposer>()
    protected webviewHtml?: string
    protected readonly logger = getLogger()

    private constructor(protected extensionContext: vscode.ExtensionContext) {}

    public static async create(extensionContext: vscode.ExtensionContext): Promise<ApplicationComposerManager> {
        const obj = new ApplicationComposerManager(extensionContext)
        await obj.fetchWebviewHtml()
        return obj
    }

    private async fetchWebviewHtml() {
        const source = isLocalDev ? localhost : cdn
        const response = await request.fetch('GET', `${source}/index.html`).response
        this.webviewHtml = await response.text()
        for (const visualization of this.managedVisualizations.values()) {
            await visualization.refreshPanel(this.extensionContext)
        }
    }

    private getWebviewContent = async () => {
        if (!this.webviewHtml) {
            void this.fetchWebviewHtml()
            return ''
        }
        const htmlFileSplit = this.webviewHtml.split('<head>')

        // Set asset source to CDN
        const source = isLocalDev ? localhost : cdn
        const baseTag = '<base href="' + source + '/" >'

        // Set dark mode, locale, and feature flags
        const locale = vscode.env.language
        const localeTag = `<meta name="locale" content="${locale}">`
        const theme = vscode.window.activeColorTheme.kind
        const isDarkMode = theme === vscode.ColorThemeKind.Dark || theme === vscode.ColorThemeKind.HighContrast
        const darkModeTag = `<meta name="dark-mode" content="${isDarkMode}">`
        const featuresTag = `<meta name="feature-flags" content='${JSON.stringify(enabledFeatures)}'>`

        return htmlFileSplit[0] + '<head>' + baseTag + localeTag + darkModeTag + featuresTag + htmlFileSplit[1]
    }

    public async visualizeTemplate(target: vscode.TextDocument | vscode.Uri): Promise<vscode.WebviewPanel | undefined> {
        const document = target instanceof vscode.Uri ? await vscode.workspace.openTextDocument(target) : target

        // Attempt to retrieve existing visualization if it exists.
        const existingVisualization = this.getExistingVisualization(document.uri.fsPath)
        if (existingVisualization) {
            existingVisualization.showPanel()

            return existingVisualization.getPanel()
        }

        // Existing visualization does not exist, construct new visualization
        try {
            const newVisualization = await ApplicationComposer.create(
                document,
                this.extensionContext,
                this.getWebviewContent
            )
            this.handleNewVisualization(document.uri.fsPath, newVisualization)

            if (vscode.version === '1.91.0') {
                void vscode.window.showWarningMessage(
                    localize(
                        'AWS.applicationComposer.visualisation.warnings.draganddrop',
                        'This version of Visual Studio Code has a bug preventing normal drag and drop functionality. ' +
                            'As a temporary workaround, hold the Shift key before releasing a resource onto the visual canvas.'
                    )
                )
            }
            return newVisualization.getPanel()
        } catch (err) {
            this.handleErr(err as Error)
        }
    }

    public async createTemplate(): Promise<vscode.WebviewPanel | undefined> {
        try {
            const document = await vscode.workspace.openTextDocument({
                language: 'yaml',
            })
            const newVisualization = await ApplicationComposer.create(
                document,
                this.extensionContext,
                this.getWebviewContent
            )
            this.handleNewVisualization(document.uri.fsPath, newVisualization)

            return newVisualization.getPanel()
        } catch (err) {
            this.handleErr(err as Error)
        }
    }

    protected getExistingVisualization(key: string): ApplicationComposer | undefined {
        return this.managedVisualizations.get(key)
    }

    protected handleErr(err: Error): void {
        void vscode.window.showInformationMessage(
            localize(
                'AWS.applicationComposer.visualisation.errors.rendering',
                'There was an error rendering Infrastructure Composer, check logs for details.'
            )
        )
        this.logger.error(`${this.name}: Unable to show App Composer webview: ${err}`)
    }

    protected handleNewVisualization(key: string, visualization: ApplicationComposer): void {
        this.managedVisualizations.set(key, visualization)

        const visualizationDisposable = visualization.onVisualizationDisposeEvent(() => {
            this.managedVisualizations.delete(key)
        })
        this.pushToExtensionContextSubscriptions(visualizationDisposable)
    }

    protected pushToExtensionContextSubscriptions(visualizationDisposable: vscode.Disposable): void {
        this.extensionContext.subscriptions.push(visualizationDisposable)
    }
}
