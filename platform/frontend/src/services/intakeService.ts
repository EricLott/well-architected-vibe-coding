import { projectService } from "./projectService";
import type { ProjectState } from "../types/app";

export interface IntakeService {
  initializeProject(ideaText: string): Promise<ProjectState>;
}

export const intakeService: IntakeService = {
  async initializeProject(ideaText) {
    if (!ideaText.trim()) {
      throw new Error("Please enter an idea before starting intake.");
    }
    return projectService.initializeProject(ideaText);
  },
};
