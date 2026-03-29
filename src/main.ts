import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { FastifyInstance } from 'fastify';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // Shim for Passport compatibility with Fastify
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (req, reply, done) => {
      (reply as any).setHeader = (name: string, value: any) => {
        reply.header(name, value);
      };
      (reply as any).end = () => {
        reply.send();
      };
      done();
    });

  const configService = app.get(ConfigService);
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');

  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(new TransformInterceptor());

  // Initialize NestJS app (wires DI, routes, etc.) without starting the server
  await app.init();

  // Directly call Fastify's listen with options object — the only way Fastify v5
  // guarantees the host binding is respected (positional args are deprecated in v5)
  const port = Number(process.env.PORT) || 3000;
  const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;
  await fastify.listen({ port, host: '0.0.0.0' });

  console.log(`Application is running on: http://0.0.0.0:${port}`);
}
bootstrap().catch((err) => {
  console.error('Error during bootstrap', err);
  process.exit(1);
});
