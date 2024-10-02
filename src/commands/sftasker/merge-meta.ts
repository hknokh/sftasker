import { Flags } from '@salesforce/sf-plugins-core';
import { CommandUtils } from '../../components/command-utils.js';
import { Constants } from '../../components/constants.js';
import { MetadataUtils } from '../../components/metadata-utils.js';
import { SFtaskerCommand } from '../../components/models.js';
import { FindMatchingFilesResult } from '../../components/types.js';
import { Utils } from '../../components/utils.js';

export type SftaskerMergeMetaResult = Record<string, never>;

// Set up the command messages
const messages = CommandUtils.setupCommandMessages('sftasker', 'merge-meta');

// eslint-disable-next-line sf-plugin/only-extend-SfCommand
export default class SftaskerMergeMeta extends SFtaskerCommand<SftaskerMergeMetaResult> {
  public static readonly summary = messages.commandMessages.getMessage('summary');
  public static readonly description = messages.commandMessages.getMessage('description');
  public static readonly examples = messages.commandMessages.getMessages('examples');

  // eslint-disable-next-line sf-plugin/spread-base-flags
  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    apiversion: Flags.orgApiVersion(),

    manifest: Flags.string({
      summary: messages.commandMessages.getMessage('flags.manifest.summary'),
      char: 'm',
      default: Constants.DEFAULT_MANIFEST_PATH,
    }),

    'metadata-root-folder': Flags.string({
      summary: messages.commandMessages.getMessage('flags.metadata-root-folder.summary'),
      char: 'r',
      required: false,
    }),

    dedup: Flags.boolean({
      summary: messages.commandMessages.getMessage('flags.dedup.summary'),
      char: 'd',
      hidden: true, // This flag is managed internally
    }),

    'merge-props': Flags.boolean({
      summary: messages.commandMessages.getMessage('flags.merge-props.summary'),
      char: 'e',
      hidden: true, // This flag is managed internally
    }),

    type: Flags.option({
      summary: messages.commandMessages.getMessage('flags.type.summary'),
      char: 't',
      required: true,
      options: ['Profile', 'CustomLabels', 'Translations'] as const,
    })(),

    'keep-temp-dirs': Flags.boolean({
      summary: messages.commandMessages.getMessage('flags.keep-temp-dirs.summary'),
      char: 'k',
    }),
  };

  public async run(): Promise<SftaskerMergeMetaResult> {
    const { flags } = await this.parse(SftaskerMergeMeta);

    // Set up the command with the necessary properties
    CommandUtils.setupCommandInstance(this, messages, flags);

    // Log the command start message
    CommandUtils.logCommandStartMessage(this);

    // Create a temporary directory for the command execution
    const tempPath = CommandUtils.createTempDirectory(this);

    // Create an instance of the MetadataUtils class
    const metadataUtils = new MetadataUtils(this, tempPath);

    // Set the metadata root folder
    const forceAppProjectRootFolder = metadataUtils.getMetadataRootFolder(flags.type);
    CommandUtils.logCommandMessage(this, 'command.progress.metadata-root-folder', forceAppProjectRootFolder);

    // Retrieve the metadata from the manifest file
    const manifestTempFolder = await metadataUtils.retrievePackageMetadataAsync(flags.manifest);
    CommandUtils.logCommandMessage(this, 'command.progress.manifest-temp-folder', manifestTempFolder);

    // List metadata files in the manifest
    const manifestMetadataFiles = metadataUtils.listMetadataFiles(flags.type, manifestTempFolder);

    // List metadata files in the force-app project
    const forceAppMetadataFiles = metadataUtils.listMetadataFiles(flags.type);
    CommandUtils.logCommandMessage(this, 'command.progress.found-local-files', forceAppMetadataFiles.length.toString());

    // Find matching metadata files in the manifest and force-app project
    CommandUtils.logCommandMessage(this, 'command.progress.finding-matching-files');
    const matchingManifest2ForceAppMetadataFiles: FindMatchingFilesResult = Utils.findMatchingFiles(
      manifestMetadataFiles,
      forceAppMetadataFiles,
      Constants.PACKAGE_XML_METADATA_NAME_TO_FILE_REGEX_REPLACE_MAPPING[flags.type]
    );

    // Missing files are those that are in the manifest but not in the force-app project
    if (
      matchingManifest2ForceAppMetadataFiles.matchingFiles.length === 0 &&
      matchingManifest2ForceAppMetadataFiles.missingFiles.length === 0
    ) {
      CommandUtils.logCommandMessage(this, 'command.result.no-components-to-merge');
      return {};
    }

    // Merge each of the matching metadata files and put them in the force-app project folder
    CommandUtils.logCommandMessage(
      this,
      'command.progress.processing-matching-files',
      matchingManifest2ForceAppMetadataFiles.matchingFiles.length.toString()
    );
    for (const matchingFile of matchingManifest2ForceAppMetadataFiles.matchingFiles) {
      metadataUtils.mergeMetadataXml(
        matchingFile.dir1Path,
        matchingFile.dir2Path,
        matchingFile.dir2Path,
        Constants.PACKAGE_XML_METADATA_NAME_TO_XNL_METADATA_FILE_ROOT_TAG_MAPPING[flags.type],
        Constants.METADATA_SECTION_KEY_MAPPING[flags.type]
      );
    }

    // Copy missing metadata files to the force-app project
    if (matchingManifest2ForceAppMetadataFiles.missingFiles.length > 0) {
      CommandUtils.logCommandMessage(
        this,
        'command.progress.copying-missing-files',
        matchingManifest2ForceAppMetadataFiles.missingFiles.length.toString()
      );

      Utils.copyFiles(
        matchingManifest2ForceAppMetadataFiles.missingFiles,
        forceAppProjectRootFolder,
        Constants.PACKAGE_XML_METADATA_NAME_TO_FILE_REGEX_REPLACE_MAPPING[flags.type]
      );
    }

    if (!flags['keep-temp-dirs']) {
      // Delete the temporary directory
      CommandUtils.deleteTempDirectory(this, manifestTempFolder);
    }

    // Log the command completion message
    CommandUtils.logCommandEndMessage(this);

    return {};
  }
}
