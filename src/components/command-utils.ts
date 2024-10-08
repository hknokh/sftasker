import fs from 'node:fs';
import path from 'node:path';
import { Connection, Messages } from '@salesforce/core';
import { Constants } from './constants.js';
import { SFtaskerCommand } from './models.js';
import { SftaskerCommandFlags } from './types.js';

/**
 * Utility class for command-related operations.
 */
export class CommandUtils {
  /**
   *  Sets up the command with the necessary properties.
   * @param command  The command object to be set up
   * @param messages  The messages object for the command
   * @param componentsMessages  The messages object for the components used in the command
   * @param flags  The flags object for the command
   */
  public static setupCommand<T>(
    command: SFtaskerCommand<T>,
    messages: Messages<string>,
    componentsMessages: Messages<string>,
    flags: SftaskerCommandFlags
  ): void {
    const updatedCommand = command;
    updatedCommand.messages = messages;
    updatedCommand.componentsMessages = componentsMessages;
    updatedCommand.flags = flags;
    // Internally manage some of the flags
    Object.assign(flags, Constants.PACKAGE_XML_METADATA_NAME_TO_FLAG_MAPPING[flags.type]);
    if (flags) {
      updatedCommand.connection = flags['target-org']?.getConnection(flags['api-version'] as string) as Connection;
      updatedCommand.orgId = flags['target-org']?.getOrgId() as string;
    }
  }

  /**
   * Creates a temporary directory for the command execution.
   * @template T - The type used in the SFtaskerCommand.
   * @param {SFtaskerCommand<T>} command - The command object for which the directory is being created.
   * @param {string} [subdir] - An optional subdirectory path.
   * @returns {string} - The path of the created temporary directory.
   */
  public static createTempDirectory<T>(command: SFtaskerCommand<T>, subdir?: string): string {
    const commandSubdirs = (command.id as string).split(':').concat(command.orgId);
    const tempPath = path.join(process.cwd(), Constants.TEMP_PATH, ...commandSubdirs, subdir ?? '');
    if (!fs.existsSync(tempPath)) {
      fs.mkdirSync(tempPath, { recursive: true });
    }
    return tempPath;
  }

  /**
   *  Deletes the temporary directory created for the command execution.
   * @param command  The command object for which the directory is being deleted
   * @param tempDir  The path of the temporary directory to be deleted
   */
  public static deleteTempDirectory<T>(command: SFtaskerCommand<T>, tempDir: string): void {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      this.throwWithErrorMessage(command, error as Error, 'errors.deleting-temp-dir', tempDir);
    }
  }

  /**
   * Throws an error with a detailed error message, including the stack trace.
   * @template T - The type used in the SFtaskerCommand.
   * @param {SFtaskerCommand<T>} command - The command object where the error is thrown.
   * @param {Error} error - The error object containing the error message and stack trace.
   * @param {string} messageKey - The key for the error message in the components messages.
   * @param {string[]} messageArgs - Additional arguments to be included in the error message.
   * @throws Will throw an error with a custom message.
   */
  public static throwWithErrorMessage<T>(
    command: SFtaskerCommand<T>,
    error: Error,
    messageKey: string,
    ...messageArgs: string[]
  ): never {
    throw command.componentsMessages.createError(messageKey, [
      ...messageArgs,
      `\nError message: ${error.message}`,
      `\nStack trace: ${error.stack}`,
    ]);
  }

  /**
   *  Throws an error with a message from the components messages.
   * @param command  The command object where the error is thrown
   * @param messageKey  The key for the error message in the components messages
   * @param messageArgs  Additional arguments to be included in the error message
   */
  public static throwError<T>(command: SFtaskerCommand<T>, messageKey: string, ...messageArgs: string[]): never {
    throw new Error(command.componentsMessages.getMessage(messageKey, messageArgs));
  }

  /**
   * Logs a component-related message in the command.
   * @template T - The type used in the SFtaskerCommand.
   * @param {SFtaskerCommand<T>} command - The command object in which the message is logged.
   * @param {string} messageKey - The key for the message in the components messages.
   * @param {string[]} messageArgs - Additional arguments to be included in the log message.
   */
  public static logComponentMessage<T>(
    command: SFtaskerCommand<T>,
    messageKey: string,
    ...messageArgs: string[]
  ): void {
    command.log('[PROGRESS INFO] ' + command.componentsMessages.getMessage(messageKey, messageArgs));
  }

  /**
   *  Logs a command-related message in the command.
   * @param command  The command object in which the message is logged
   * @param messageKey  The key for the message in the command messages
   * @param messageArgs  Additional arguments to be included in the log message
   */
  public static logCommandMessage<T>(command: SFtaskerCommand<T>, messageKey: string, ...messageArgs: string[]): void {
    command.log('[COMMAND INFO] ' + command.messages.getMessage(messageKey, messageArgs));
  }

  /**
   *  Start spinner, update status, or stop spinner with a message from the components messages.
   * @param command  The command object where the spinner is started, updated, or stopped
   * @param mode  The mode in which the spinner is used: start, status, or stop
   * @param messageKey  The key for the message in the components messages
   * @param messageArgs  Additional arguments to be included in the spinner message
   */
  public static spinnerwithComponentMessage<T>(
    command: SFtaskerCommand<T>,
    mode: 'start' | 'status' | 'stop' = 'start',
    messageKey?: string,
    ...messageArgs: string[]
  ): void {
    switch (mode) {
      case 'start':
        command.spinner.start(
          '[PROGRESS INFO] ' + command.componentsMessages.getMessage(messageKey as string, messageArgs)
        );
        break;
      case 'status':
        // eslint-disable-next-line no-param-reassign
        command.spinner.status =
          '[PROGRESS INFO] ' + command.componentsMessages.getMessage(messageKey as string, messageArgs);
        break;
      case 'stop':
        command.spinner.stop(
          '\n[PROGRESS INFO] ' + command.componentsMessages.getMessage(messageKey as string, messageArgs)
        );
        break;
    }
  }
}
