import { Controller } from '@nestjs/common'
import { Implement } from '@orpc/nest'
import { contract } from '../contracts'
import { deleteFile, findFile, uploadFile } from '../routers/file'

@Controller()
export class FileController {
  constructor() {}

  @Implement(contract.file.upload)
  upload() {
    return uploadFile
  }

  @Implement(contract.file.delete)
  delete() {
    return deleteFile
  }

  @Implement(contract.file.find)
  find() {
    return findFile
  }
}
